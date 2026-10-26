use crate::services::media::protocol::{self, Outgoing, Profile};
use crate::services::media::prefs::current_prefs;
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

const MAX_PENDING_FRAMES: usize = 2;
const MAX_KEYFRAME_INTERVAL_MS: u32 = 2000;

pub enum CameraCommand {
    SetProfile(Profile),
    RequestKeyframe,
}

pub struct CameraSession {
    tx: Sender<CameraCommand>,
}

impl CameraSession {
    pub fn start(profile: Profile, out: UnboundedSender<Outgoing>, pending_frames: Arc<AtomicUsize>) -> Self {
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new().name("call-camera".into()).spawn(move || {
            if let Err(why) = capture_loop(profile, rx, &out, &pending_frames) {
                let _ = out.send(protocol::fault("camera", &why));
            }
        });
        Self { tx }
    }

    pub fn send(&self, command: CameraCommand) {
        let _ = self.tx.send(command);
    }
}

pub fn device_names() -> Vec<String> {
    nokhwa::query(ApiBackend::Auto).map(|cameras| cameras.iter().map(|camera| camera.human_name()).collect()).unwrap_or_default()
}

fn selected_camera_index() -> CameraIndex {
    let wanted_name = current_prefs().camera;
    if wanted_name.is_empty() {
        return CameraIndex::Index(0);
    }
    nokhwa::query(ApiBackend::Auto)
        .ok()
        .and_then(|cameras| cameras.into_iter().find(|camera| camera.human_name() == wanted_name))
        .map_or(CameraIndex::Index(0), |camera| camera.index().clone())
}

fn create_encoder(profile: &Profile) -> Result<Encoder, String> {
    let keyframe_period = ((profile.fps * profile.key_ms.min(MAX_KEYFRAME_INTERVAL_MS)) as f32 / 1000.0).round().max(1.0) as u32;
    let config = EncoderConfig::new()
        .bitrate(BitRate::from_bps(profile.bitrate))
        .max_frame_rate(FrameRate::from_hz(profile.fps as f32))
        .usage_type(UsageType::CameraVideoRealTime)
        .rate_control_mode(RateControlMode::Bitrate)
        .intra_frame_period(IntraFramePeriod::from_num_frames(keyframe_period))
        .scene_change_detect(false)
        .skip_frames(false);
    Encoder::with_api_config(OpenH264API::from_source(), config).map_err(|e| e.to_string())
}

fn capture_loop(mut profile: Profile, commands: Receiver<CameraCommand>, out: &UnboundedSender<Outgoing>, pending_frames: &AtomicUsize) -> Result<(), String> {
    let requested = CameraFormat::new(Resolution::new(1280, 720), FrameFormat::MJPEG, 24);
    let mut camera = Camera::new(selected_camera_index(), RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(requested))).map_err(|e| e.to_string())?;
    camera.open_stream().map_err(|e| e.to_string())?;
    let _ = out.send(protocol::log(format!("camera: {} {}", camera.info().human_name(), camera.camera_format())));
    let mut encoder = create_encoder(&profile)?;
    let mut rgb = Vec::new();
    let started_at = Instant::now();
    let mut next_due = started_at;
    let mut sent_frames = 0u64;
    loop {
        loop {
            match commands.try_recv() {
                Ok(CameraCommand::SetProfile(new_profile)) => {
                    profile = new_profile;
                    encoder = create_encoder(&profile)?;
                }
                Ok(CameraCommand::RequestKeyframe) => encoder.force_intra_frame(),
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    let _ = camera.stop_stream();
                    return Ok(());
                }
            }
        }
        let frame = camera.frame().map_err(|e| e.to_string())?;
        let now = Instant::now();
        if now < next_due {
            continue;
        }
        next_due = (next_due + Duration::from_secs(1) / profile.fps.max(1)).max(now);
        let resolution = frame.resolution();
        rgb.resize((resolution.width_x * resolution.height_y * 3) as usize, 0);
        frame.decode_image_to_buffer::<RgbFormat>(&mut rgb).map_err(|e| e.to_string())?;
        let scaled = crop_scale(&rgb, resolution.width_x as usize, resolution.height_y as usize, profile.width as usize, profile.height as usize);
        let yuv = YUVBuffer::from_rgb8_source(RgbSliceU8::new(&scaled, (profile.width as usize, profile.height as usize)));
        let timestamp = Timestamp::from_millis(now.duration_since(started_at).as_millis() as u64);
        let (data, key) = clean_h264(&encoder.encode_at(&yuv, timestamp).map_err(|e| e.to_string())?.to_vec());
        if data.is_empty() || (!key && pending_frames.load(Ordering::Relaxed) > MAX_PENDING_FRAMES) {
            continue;
        }
        pending_frames.fetch_add(1, Ordering::Relaxed);
        let _ = out.send(protocol::camera_frame(key, &data));
        sent_frames += 1;
        if sent_frames == 1 {
            let _ = out.send(protocol::camera_started());
        }
    }
}

fn crop_scale(src: &[u8], src_width: usize, src_height: usize, dst_width: usize, dst_height: usize) -> Vec<u8> {
    let (crop_width, crop_height) =
        if src_width * dst_height > src_height * dst_width { (src_height * dst_width / dst_height, src_height) } else { (src_width, src_width * dst_height / dst_width) };
    let (crop_x, crop_y) = ((src_width - crop_width) / 2, (src_height - crop_height) / 2);
    let mut out = vec![0u8; dst_width * dst_height * 3];
    for y in 0..dst_height {
        let src_y = crop_y + y * crop_height / dst_height;
        for x in 0..dst_width {
            let src_index = (src_y * src_width + crop_x + x * crop_width / dst_width) * 3;
            out[(y * dst_width + x) * 3..][..3].copy_from_slice(&src[src_index..src_index + 3]);
        }
    }
    out
}

// Điện thoại và useVideo cần start code 4 byte, không có NAL SEI (6) và AUD (9)
fn clean_h264(data: &[u8]) -> (Vec<u8>, bool) {
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
    for (index, &start) in starts.iter().enumerate() {
        let mut end = starts.get(index + 1).map_or(data.len(), |&next| next - 3);
        if end > start && starts.get(index + 1).is_some() && data[end - 1] == 0 {
            end -= 1;
        }
        let Some(&header) = data.get(start) else { continue };
        let nal_type = header & 0x1f;
        if nal_type == 6 || nal_type == 9 || end <= start {
            continue;
        }
        key |= nal_type == 5;
        out.extend_from_slice(&[0, 0, 0, 1]);
        out.extend_from_slice(&data[start..end]);
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
        let (out, key) = clean_h264(&d);
        assert!(key);
        assert_eq!(out, [0, 0, 0, 1, 0x65, 0xaa, 0xbb]);
    }

    #[test]
    fn key_frames_carry_sps_and_pps() {
        let profile = Profile { width: 640, height: 360, fps: 15, bitrate: 500_000, key_ms: 200 };
        let mut encoder = create_encoder(&profile).unwrap();
        let rgb: Vec<u8> = (0..640 * 360 * 3).map(|i| (i % 251) as u8).collect();
        let yuv = YUVBuffer::from_rgb8_source(RgbSliceU8::new(&rgb, (640, 360)));
        let mut keys = 0;
        for k in 0..9 {
            let (data, key) = clean_h264(&encoder.encode_at(&yuv, Timestamp::from_millis(k * 1000 / 15)).unwrap().to_vec());
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
