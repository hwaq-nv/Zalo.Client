mod config;
mod device;
mod dsp;
mod playout;

use crate::media::protocol::{self, Frame, Out};
use config::AudioConfig;
use device::{DeviceError, Devices, Resample};
use dsp::{CHUNK, Dsp, audio_level};
use opus::{Application, Bitrate, Channels, Encoder, Signal};
use playout::{FRAME, Playout};
use ringbuf::traits::{Consumer, Observer, Producer};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

pub use device::names as device_names;

// Nhịp phát theo card âm thanh, không theo đồng hồ máy: chỉ tạo khung mới khi loa đã tiêu bớt
const SPEAKER_QUEUE_MS: usize = 60;

enum Cmd {
    Packet { idx: u32, src: u32, opus: Vec<u8> },
    Mute(bool),
    SpeakerOff(bool),
    Device { mic: bool, name: String },
}

pub struct AudioSession {
    tx: Sender<Cmd>,
}

impl AudioSession {
    pub fn start(args: &[String], out: UnboundedSender<Out>) -> Self {
        let cfg = AudioConfig::parse(args).with_prefs(&crate::media::prefs());
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new().name("call-audio".into()).spawn(move || run(cfg, rx, out));
        Self { tx }
    }

    pub fn frame(&self, f: Frame) {
        let cmd = match f {
            Frame::Packet { idx, src, opus } => Cmd::Packet { idx, src, opus: opus.to_vec() },
            Frame::Mute(on) => Cmd::Mute(on),
            Frame::SpeakerOff(on) => Cmd::SpeakerOff(on),
            Frame::Device { mic, name } => Cmd::Device { mic, name },
            Frame::MicVolume(_) => return,
        };
        let _ = self.tx.send(cmd);
    }
}

struct Path {
    dev: Devices,
    up: Resample,
    down: Resample,
}

fn open(mic: Option<&str>, speaker: Option<&str>, errors: &Sender<DeviceError>, out: &UnboundedSender<Out>) -> Option<Path> {
    match device::open(mic, speaker, errors.clone()) {
        Ok(dev) => {
            let _ = out.send(protocol::log(format!("audio: mic {} Hz, loa {} Hz", dev.in_rate, dev.out_rate)));
            Some(Path { up: Resample::new(dev.in_rate, 16_000), down: Resample::new(16_000, dev.out_rate), dev })
        }
        Err((is_mic, why)) => {
            let _ = out.send(protocol::fault(if is_mic { "mic" } else { "speaker" }, &why));
            None
        }
    }
}

fn encoder(c: &AudioConfig) -> Encoder {
    let mut e = Encoder::new(16_000, Channels::Mono, Application::Voip).expect("opus encoder");
    let _ = e.set_bitrate(Bitrate::Bits(c.bitrate));
    let _ = e.set_complexity(c.complexity);
    let _ = e.set_signal(Signal::Voice);
    let _ = e.set_inband_fec(c.fec);
    let _ = e.set_packet_loss_perc(if c.fec { c.loss } else { 0 });
    e
}

fn run(cfg: AudioConfig, rx: Receiver<Cmd>, out: UnboundedSender<Out>) {
    let (err_tx, err_rx) = mpsc::channel::<DeviceError>();
    let (mut mic_name, mut speaker_name) = (cfg.mic.clone(), cfg.speaker.clone());
    let mut path = open(mic_name.as_deref(), speaker_name.as_deref(), &err_tx, &out);
    let (min_target, max_target) = cfg.targets();
    let mut playout = Playout::new(min_target, max_target);
    let mut dsp = Dsp::new(&cfg);
    let mut enc = encoder(&cfg);
    let (mut muted, mut speaker_off) = (false, false);
    let mut mic_pcm: Vec<i16> = Vec::with_capacity(FRAME * 2);
    let mut chunk = vec![0f32; 4800];
    let mut packet = [0u8; 1500];
    let t0 = Instant::now();

    loop {
        loop {
            match rx.try_recv() {
                Ok(Cmd::Packet { idx, src, opus }) if path.is_some() => playout.push(idx, src, &opus, t0.elapsed().as_secs_f64()),
                Ok(Cmd::Packet { .. }) => {}
                Ok(Cmd::Mute(on)) => muted = on,
                Ok(Cmd::SpeakerOff(on)) => speaker_off = on,
                Ok(Cmd::Device { mic, name }) => {
                    let name = (!name.is_empty()).then_some(name);
                    if mic { mic_name = name } else { speaker_name = name }
                    drop(path.take());
                    path = open(mic_name.as_deref(), speaker_name.as_deref(), &err_tx, &out);
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }
        if let Ok((is_mic, why)) = err_rx.try_recv() {
            while err_rx.try_recv().is_ok() {}
            let _ = out.send(protocol::log(format!("audio: {} lỗi: {why}, mở lại", if is_mic { "mic" } else { "loa" })));
            drop(path.take());
            path = open(mic_name.as_deref(), speaker_name.as_deref(), &err_tx, &out);
        }
        if let Some(p) = path.as_mut() {
            let queue = SPEAKER_QUEUE_MS * p.dev.out_rate as usize / 1000;
            while p.dev.speaker.occupied_len() + p.down.out.len() < queue {
                let frame = playout.pull(t0.elapsed().as_secs_f64());
                let frame = if speaker_off { [0; FRAME] } else { frame };
                for c in frame.chunks(CHUNK) {
                    dsp.render(c);
                }
                let f: Vec<f32> = frame.iter().map(|&v| v as f32 / 32768.0).collect();
                p.down.push(&f);
                while let Some(&s) = p.down.out.front() {
                    if p.dev.speaker.try_push(s).is_err() {
                        break;
                    }
                    p.down.out.pop_front();
                }
            }
            let n = p.dev.mic.pop_slice(&mut chunk);
            p.up.push(&chunk[..n]);
            let delay_ms = ((p.dev.speaker.occupied_len() + p.down.out.len()) * 1000 / p.dev.out_rate as usize
                + p.dev.mic.occupied_len() * 1000 / p.dev.in_rate as usize
                + 10) as i32;
            while p.up.out.len() >= CHUNK {
                let mut c: Vec<i16> = p.up.out.drain(..CHUNK).map(|s| (s * 32768.0).clamp(-32768.0, 32767.0) as i16).collect();
                dsp.capture(&mut c, delay_ms);
                mic_pcm.extend(c);
                if mic_pcm.len() < FRAME {
                    continue;
                }
                let mut frame: Vec<i16> = mic_pcm.drain(..FRAME).collect();
                if muted {
                    frame.fill(0);
                }
                if let Ok(len) = enc.encode(&frame, &mut packet) {
                    let _ = out.send(protocol::mic_frame(audio_level(&frame), &packet[..len]));
                }
            }
        }
        for note in playout.notes.drain(..) {
            let _ = out.send(protocol::log(format!("audio: {note}")));
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}
