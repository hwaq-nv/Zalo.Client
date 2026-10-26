mod config;
mod device;
mod dsp;
mod playout;

use crate::services::media::protocol::{self, Frame, Outgoing};
use crate::services::media::prefs::current_prefs;
use config::AudioConfig;
use device::{DeviceError, Devices, Resample};
use dsp::{CHUNK_SAMPLES, Dsp, audio_level};
use opus::{Application, Bitrate, Channels, Encoder, Signal};
use playout::{FRAME_SAMPLES, Playout};
use ringbuf::traits::{Consumer, Observer, Producer};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

pub use device::device_names;

// Nhịp phát theo card âm thanh, không theo đồng hồ máy: chỉ tạo khung mới khi loa đã tiêu bớt
const SPEAKER_QUEUE_MS: usize = 60;

enum AudioCommand {
    Packet { idx: u32, src: u32, opus: Vec<u8> },
    Mute(bool),
    SpeakerOff(bool),
    Device { mic: bool, name: String },
}

pub struct AudioSession {
    tx: Sender<AudioCommand>,
}

impl AudioSession {
    pub fn start(args: &[String], out: UnboundedSender<Outgoing>) -> Self {
        let config = AudioConfig::parse(args).with_prefs(&current_prefs());
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new().name("call-audio".into()).spawn(move || audio_loop(config, rx, out));
        Self { tx }
    }

    pub fn handle_frame(&self, frame: Frame) {
        let command = match frame {
            Frame::Packet { idx, src, opus } => AudioCommand::Packet { idx, src, opus: opus.to_vec() },
            Frame::Mute(on) => AudioCommand::Mute(on),
            Frame::SpeakerOff(on) => AudioCommand::SpeakerOff(on),
            Frame::Device { mic, name } => AudioCommand::Device { mic, name },
            Frame::MicVolume(_) => return,
        };
        let _ = self.tx.send(command);
    }
}

struct AudioPipeline {
    devices: Devices,
    mic_resampler: Resample,
    speaker_resampler: Resample,
}

fn open_pipeline(mic: Option<&str>, speaker: Option<&str>, errors: &Sender<DeviceError>, out: &UnboundedSender<Outgoing>) -> Option<AudioPipeline> {
    match device::open_devices(mic, speaker, errors.clone()) {
        Ok(devices) => {
            let _ = out.send(protocol::log(format!("audio: mic {} Hz, loa {} Hz", devices.input_rate, devices.output_rate)));
            Some(AudioPipeline { mic_resampler: Resample::new(devices.input_rate, 16_000), speaker_resampler: Resample::new(16_000, devices.output_rate), devices })
        }
        Err((is_mic, why)) => {
            let _ = out.send(protocol::fault(if is_mic { "mic" } else { "speaker" }, &why));
            None
        }
    }
}

fn create_encoder(config: &AudioConfig) -> Encoder {
    let mut encoder = Encoder::new(16_000, Channels::Mono, Application::Voip).expect("opus encoder");
    let _ = encoder.set_bitrate(Bitrate::Bits(config.bitrate));
    let _ = encoder.set_complexity(config.complexity);
    let _ = encoder.set_signal(Signal::Voice);
    let _ = encoder.set_inband_fec(config.fec);
    let _ = encoder.set_packet_loss_perc(if config.fec { config.packet_loss_percent } else { 0 });
    encoder
}

fn audio_loop(config: AudioConfig, commands: Receiver<AudioCommand>, out: UnboundedSender<Outgoing>) {
    let (error_tx, error_rx) = mpsc::channel::<DeviceError>();
    let (mut mic_name, mut speaker_name) = (config.mic.clone(), config.speaker.clone());
    let mut pipeline = open_pipeline(mic_name.as_deref(), speaker_name.as_deref(), &error_tx, &out);
    let (min_target, max_target) = config.playout_targets();
    let mut playout = Playout::new(min_target, max_target);
    let mut dsp = Dsp::new(&config);
    let mut encoder = create_encoder(&config);
    let (mut muted, mut speaker_off) = (false, false);
    let mut mic_pcm: Vec<i16> = Vec::with_capacity(FRAME_SAMPLES * 2);
    let mut mic_samples = vec![0f32; 4800];
    let mut packet = [0u8; 1500];
    let started_at = Instant::now();

    loop {
        loop {
            match commands.try_recv() {
                Ok(AudioCommand::Packet { idx, src, opus }) if pipeline.is_some() => playout.push(idx, src, &opus, started_at.elapsed().as_secs_f64()),
                Ok(AudioCommand::Packet { .. }) => {}
                Ok(AudioCommand::Mute(on)) => muted = on,
                Ok(AudioCommand::SpeakerOff(on)) => speaker_off = on,
                Ok(AudioCommand::Device { mic, name }) => {
                    let name = (!name.is_empty()).then_some(name);
                    if mic { mic_name = name } else { speaker_name = name }
                    drop(pipeline.take());
                    pipeline = open_pipeline(mic_name.as_deref(), speaker_name.as_deref(), &error_tx, &out);
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }
        if let Ok((is_mic, why)) = error_rx.try_recv() {
            while error_rx.try_recv().is_ok() {}
            let _ = out.send(protocol::log(format!("audio: {} lỗi: {why}, mở lại", if is_mic { "mic" } else { "loa" })));
            drop(pipeline.take());
            pipeline = open_pipeline(mic_name.as_deref(), speaker_name.as_deref(), &error_tx, &out);
        }
        if let Some(AudioPipeline { devices, mic_resampler, speaker_resampler }) = pipeline.as_mut() {
            let speaker_queue = SPEAKER_QUEUE_MS * devices.output_rate as usize / 1000;
            while devices.speaker.occupied_len() + speaker_resampler.output.len() < speaker_queue {
                let frame = playout.pull(started_at.elapsed().as_secs_f64());
                let frame = if speaker_off { [0; FRAME_SAMPLES] } else { frame };
                for chunk in frame.chunks(CHUNK_SAMPLES) {
                    dsp.render(chunk);
                }
                let samples: Vec<f32> = frame.iter().map(|&v| v as f32 / 32768.0).collect();
                speaker_resampler.push(&samples);
                while let Some(&sample) = speaker_resampler.output.front() {
                    if devices.speaker.try_push(sample).is_err() {
                        break;
                    }
                    speaker_resampler.output.pop_front();
                }
            }
            let read = devices.mic.pop_slice(&mut mic_samples);
            mic_resampler.push(&mic_samples[..read]);
            let delay_ms = ((devices.speaker.occupied_len() + speaker_resampler.output.len()) * 1000 / devices.output_rate as usize
                + devices.mic.occupied_len() * 1000 / devices.input_rate as usize
                + 10) as i32;
            while mic_resampler.output.len() >= CHUNK_SAMPLES {
                let mut chunk: Vec<i16> = mic_resampler.output.drain(..CHUNK_SAMPLES).map(|s| (s * 32768.0).clamp(-32768.0, 32767.0) as i16).collect();
                dsp.capture(&mut chunk, delay_ms);
                mic_pcm.extend(chunk);
                if mic_pcm.len() < FRAME_SAMPLES {
                    continue;
                }
                let mut frame: Vec<i16> = mic_pcm.drain(..FRAME_SAMPLES).collect();
                if muted {
                    frame.fill(0);
                }
                if let Ok(len) = encoder.encode(&frame, &mut packet) {
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
