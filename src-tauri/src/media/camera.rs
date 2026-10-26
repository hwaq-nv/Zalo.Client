use crate::media::protocol::{self, Out, Profile};
use nokhwa::Camera;
use nokhwa::pixel_format::RgbFormat;
use nokhwa::utils::{ApiBackend, CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType, Resolution};
use openh264::{OpenH264API, Timestamp};
use openh264::encoder::{BitRate, Encoder, EncoderConfig, FrameRate, IntraFramePeriod, RateControlMode, UsageType};
use openh264::formats::{RgbSliceU8, YUVBuffer};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

const MAX_PENDING: usize = 2;
const MAX_KEY_MS: u32 = 2000;

pub enum CamCmd {
    Profile(Profile),
    Key,
}

pub struct CameraSession {
    tx: Sender<CamCmd>,
}

impl CameraSession {
    pub fn start(p: Profile, out: UnboundedSender<Out>, pending: Arc<AtomicUsize>) -> Self {
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new().name("call-camera".into()).spawn(move || {
            if let Err(why) = run(p, rx, &out, &pending) {
                let _ = out.send(protocol::fault("camera", &why));
            }
        });
        Self { tx }
    }

    pub fn send(&self, c: CamCmd) {
        let _ = self.tx.send(c);
    }
}

pub fn names() -> Vec<String> {
    nokhwa::query(ApiBackend::Auto).map(|l| l.iter().map(|c| c.human_name()).collect()).unwrap_or_default()
}

fn camera_index() -> CameraIndex {
    let want = crate::media::prefs().camera;
    if want.is_empty() {
        return CameraIndex::Index(0);
    }
    nokhwa::query(ApiBackend::Auto)
        .ok()
        .and_then(|list| list.into_iter().find(|c| c.human_name() == want))
        .map_or(CameraIndex::Index(0), |c| c.index().clone())
}

fn encoder(p: &Profile) -> Result<Encoder, String> {
    let key_frames = ((p.fps * p.key_ms.min(MAX_KEY_MS)) as f32 / 1000.0).round().max(1.0) as u32;
    let config = EncoderConfig::new()
        .bitrate(BitRate::from_bps(p.bitrate))
        .max_frame_rate(FrameRate::from_hz(p.fps as f32))
        .usage_type(UsageType::CameraVideoRealTime)
        .rate_control_mode(RateControlMode::Bitrate)
        .intra_frame_period(IntraFramePeriod::from_num_frames(key_frames))
        .scene_change_detect(false)
        .skip_frames(false);
    Encoder::with_api_config(OpenH264API::from_source(), config).map_err(|e| e.to_string())
}

fn run(mut p: Profile, rx: Receiver<CamCmd>, out: &UnboundedSender<Out>, pending: &AtomicUsize) -> Result<(), String> {
    let want = CameraFormat::new(Resolution::new(1280, 720), FrameFormat::MJPEG, 24);
    let mut cam = Camera::new(camera_index(), RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(want))).map_err(|e| e.to_string())?;
    cam.open_stream().map_err(|e| e.to_string())?;
    let _ = out.send(protocol::log(format!("camera: {} {}", cam.info().human_name(), cam.camera_format())));
    let mut enc = encoder(&p)?;
    let mut rgb = Vec::new();
    let t0 = Instant::now();
    let mut next_due = t0;
    let mut sent = 0u64;
    loop {
        loop {
            match rx.try_recv() {
                Ok(CamCmd::Profile(np)) => {
                    p = np;
                    enc = encoder(&p)?;
                }
                Ok(CamCmd::Key) => enc.force_intra_frame(),
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    let _ = cam.stop_stream();
                    return Ok(());
                }
            }
        }
        let frame = cam.frame().map_err(|e| e.to_string())?;
        let now = Instant::now();
        if now < next_due {
            continue;
        }
        next_due = (next_due + Duration::from_secs(1) / p.fps.max(1)).max(now);
        let res = frame.resolution();
        rgb.resize((res.width_x * res.height_y * 3) as usize, 0);
        frame.decode_image_to_buffer::<RgbFormat>(&mut rgb).map_err(|e| e.to_string())?;
        let scaled = crop_scale(&rgb, res.width_x as usize, res.height_y as usize, p.width as usize, p.height as usize);
        let yuv = YUVBuffer::from_rgb8_source(RgbSliceU8::new(&scaled, (p.width as usize, p.height as usize)));
        let ts = Timestamp::from_millis(now.duration_since(t0).as_millis() as u64);
        let (data, key) = clean(&enc.encode_at(&yuv, ts).map_err(|e| e.to_string())?.to_vec());
        if data.is_empty() || (!key && pending.load(Ordering::Relaxed) > MAX_PENDING) {
            continue;
        }
        pending.fetch_add(1, Ordering::Relaxed);
        let _ = out.send(protocol::camera_frame(key, &data));
        sent += 1;
        if sent == 1 {
            let _ = out.send(protocol::camera_started());
        }
    }
}

fn crop_scale(src: &[u8], sw: usize, sh: usize, dw: usize, dh: usize) -> Vec<u8> {
    let (cw, ch) = if sw * dh > sh * dw { (sh * dw / dh, sh) } else { (sw, sw * dh / dw) };
    let (x0, y0) = ((sw - cw) / 2, (sh - ch) / 2);
    let mut out = vec![0u8; dw * dh * 3];
    for y in 0..dh {
        let sy = y0 + y * ch / dh;
        for x in 0..dw {
            let s = (sy * sw + x0 + x * cw / dw) * 3;
            out[(y * dw + x) * 3..][..3].copy_from_slice(&src[s..s + 3]);
        }
    }
    out
}

// Điện thoại và useVideo cần start code 4 byte, không có NAL SEI (6) và AUD (9)
fn clean(data: &[u8]) -> (Vec<u8>, bool) {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            starts.push(i + 3);
            i += 3;
        } else {
            i += 1;
        }
    }
    let mut out = Vec::with_capacity(data.len());
    let mut key = false;
    for (k, &s) in starts.iter().enumerate() {
        let mut end = starts.get(k + 1).map_or(data.len(), |&n| n - 3);
        if end > s && starts.get(k + 1).is_some() && data[end - 1] == 0 {
            end -= 1;
        }
        let Some(&head) = data.get(s) else { continue };
        let t = head & 0x1f;
        if t == 6 || t == 9 || end <= s {
            continue;
        }
        key |= t == 5;
        out.extend_from_slice(&[0, 0, 0, 1]);
        out.extend_from_slice(&data[s..end]);
    }
    (out, key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nal_types(d: &[u8]) -> Vec<u8> {
        d.windows(4).enumerate().filter(|(_, w)| *w == [0, 0, 0, 1]).map(|(i, _)| d[i + 4] & 0x1f).collect()
    }

    #[test]
    fn crop_scale_keeps_the_middle() {
        let px = |v: u8| [v, v, v];
        let src: Vec<u8> = [10, 20, 30, 40, 50, 60, 70, 80].iter().flat_map(|&v| px(v)).collect();
        let out = crop_scale(&src, 4, 2, 2, 2);
        assert_eq!(out.iter().step_by(3).copied().collect::<Vec<_>>(), [20, 30, 60, 70]);
    }

    #[test]
    fn clean_drops_sei_and_aud() {
        let d = [0, 0, 0, 1, 9, 0x10, 0, 0, 0, 1, 6, 1, 2, 0, 0, 1, 0x65, 0xaa, 0xbb];
        let (out, key) = clean(&d);
        assert!(key);
        assert_eq!(out, [0, 0, 0, 1, 0x65, 0xaa, 0xbb]);
    }

    #[test]
    fn key_frames_carry_sps_and_pps() {
        let p = Profile { width: 640, height: 360, fps: 15, bitrate: 500_000, key_ms: 200 };
        let mut enc = encoder(&p).unwrap();
        let rgb: Vec<u8> = (0..640 * 360 * 3).map(|i| (i % 251) as u8).collect();
        let yuv = YUVBuffer::from_rgb8_source(RgbSliceU8::new(&rgb, (640, 360)));
        let mut keys = 0;
        for k in 0..9 {
            let (data, key) = clean(&enc.encode_at(&yuv, Timestamp::from_millis(k * 1000 / 15)).unwrap().to_vec());
            assert!(!data.is_empty());
            if key {
                keys += 1;
                let t = nal_types(&data);
                assert!(t.contains(&7) && t.contains(&8) && t.contains(&5), "{t:?}");
            }
        }
        assert!(keys >= 3, "{keys}");
    }
}
