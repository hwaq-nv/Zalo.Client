use super::config::AudioConfig;
use sonora::config::{AdaptiveDigital, EchoCanceller, GainController2, HighPassFilter, NoiseSuppression};
use sonora::{AudioProcessing, Config, StreamConfig};

pub const CHUNK: usize = 160;

pub struct Dsp {
    apm: AudioProcessing,
    out: [i16; CHUNK],
}

impl Dsp {
    pub fn new(c: &AudioConfig) -> Self {
        let config = Config {
            high_pass_filter: c.high_pass.then(HighPassFilter::default),
            echo_canceller: c.aec.then(EchoCanceller::default),
            noise_suppression: c.ns.then(NoiseSuppression::default),
            gain_controller2: c.agc.then(|| GainController2 { adaptive_digital: Some(AdaptiveDigital::default()), ..Default::default() }),
            ..Default::default()
        };
        let stream = StreamConfig::new(16_000, 1);
        Self { apm: AudioProcessing::builder().config(config).capture_config(stream).render_config(stream).build(), out: [0; CHUNK] }
    }

    pub fn render(&mut self, chunk: &[i16]) {
        let _ = self.apm.process_render_i16(chunk, &mut self.out);
    }

    pub fn capture(&mut self, chunk: &mut [i16], delay_ms: i32) {
        let _ = self.apm.set_stream_delay_ms(delay_ms);
        if self.apm.process_capture_i16(chunk, &mut self.out).is_ok() {
            chunk.copy_from_slice(&self.out);
        }
    }
}

// RFC 6464: 0 (to nhất) .. 127 (im lặng)
pub fn audio_level(pcm: &[i16]) -> u8 {
    if pcm.is_empty() {
        return 127;
    }
    let rms = (pcm.iter().map(|&v| (v as f64) * (v as f64)).sum::<f64>() / pcm.len() as f64).sqrt();
    if rms < 1.0 {
        return 127;
    }
    (-20.0 * (rms / 32768.0).log10()).round().clamp(0.0, 127.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(amp: f64) -> Vec<i16> {
        (0..320).map(|i| (amp * (2.0 * std::f64::consts::PI * 440.0 * i as f64 / 16_000.0).sin()) as i16).collect()
    }

    #[test]
    fn level_matches_audio_io() {
        assert_eq!(audio_level(&tone(1000.0)), 33);
        assert_eq!(audio_level(&tone(20000.0)), 7);
        assert_eq!(audio_level(&[0; 320]), 127);
    }

    #[test]
    fn processes_10ms_chunks() {
        let mut dsp = Dsp::new(&AudioConfig::default());
        let t = tone(8000.0);
        for k in 0..50 {
            dsp.render(&t[..CHUNK]);
            let mut c = t[(k % 2) * CHUNK..(k % 2 + 1) * CHUNK].to_vec();
            dsp.capture(&mut c, 40);
            assert_eq!(c.len(), CHUNK);
        }
    }
}
