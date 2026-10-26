use crate::media::Prefs;

#[derive(Debug, Clone, PartialEq)]
pub struct AudioConfig {
    pub min_delay_ms: u32,
    pub max_delay_ms: u32,
    pub bitrate: i32,
    pub complexity: i32,
    pub fec: bool,
    pub loss: i32,
    pub aec: bool,
    pub ns: bool,
    pub agc: bool,
    pub high_pass: bool,
    pub mic: Option<String>,
    pub speaker: Option<String>,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self { min_delay_ms: 100, max_delay_ms: 0, bitrate: 32_000, complexity: 10, fec: true, loss: 5, aec: true, ns: true, agc: true, high_pass: true, mic: None, speaker: None }
    }
}

impl AudioConfig {
    pub fn parse(args: &[String]) -> Self {
        let mut c = Self::default();
        let mut it = args.iter();
        while let Some(a) = it.next() {
            let mut num = || it.next().and_then(|v| v.parse::<i64>().ok());
            match a.as_str() {
                "--min-delay" => c.min_delay_ms = num().unwrap_or(100) as u32,
                "--max-delay" => c.max_delay_ms = num().unwrap_or(0) as u32,
                "--bitrate" => c.bitrate = num().unwrap_or(32_000) as i32,
                "--complexity" => c.complexity = num().unwrap_or(10) as i32,
                "--loss" => c.loss = num().unwrap_or(5) as i32,
                "--no-fec" => c.fec = false,
                "--no-aec" => c.aec = false,
                "--no-ns" => c.ns = false,
                "--no-high-pass" => c.high_pass = false,
                "--mic" => c.mic = it.next().cloned().filter(|s| !s.is_empty()),
                "--speaker" => c.speaker = it.next().cloned().filter(|s| !s.is_empty()),
                _ => {}
            }
        }
        c
    }

    // --mic/--speaker của server vẫn được ưu tiên
    pub fn with_prefs(mut self, p: &Prefs) -> Self {
        let pick = |s: &str| Some(s.to_string()).filter(|s| !s.is_empty());
        self.mic = self.mic.or_else(|| pick(&p.mic));
        self.speaker = self.speaker.or_else(|| pick(&p.speaker));
        self.ns &= p.noise_suppression;
        self.agc = p.mic_gain;
        self
    }

    pub fn targets(&self) -> (usize, usize) {
        let min = 2.max(self.min_delay_ms.div_ceil(20) as usize);
        let max = if self.max_delay_ms > 0 { self.max_delay_ms.div_ceil(20) as usize } else { 10 };
        (min, min.max(max))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &str) -> Vec<String> {
        s.split(' ').filter(|a| !a.is_empty()).map(String::from).collect()
    }

    #[test]
    fn parses_audio_io_flags() {
        let c = AudioConfig::parse(&args("--mix --min-delay 80 --max-delay 1000 --no-aec --bitrate 20000 --no-fec --mic USB --vad"));
        assert_eq!(c.min_delay_ms, 80);
        assert_eq!(c.max_delay_ms, 1000);
        assert!(!c.aec && !c.fec && c.ns && c.high_pass);
        assert_eq!(c.bitrate, 20_000);
        assert_eq!(c.mic.as_deref(), Some("USB"));
        assert_eq!(c.targets(), (4, 50));
        assert_eq!(AudioConfig::parse(&[]).targets(), (5, 10));
        assert_eq!(AudioConfig::parse(&args("--min-delay 20")).targets(), (2, 10));
    }

    #[test]
    fn prefs_fill_what_the_server_left() {
        let p = Prefs { mic: "USB".into(), speaker: String::new(), camera: String::new(), noise_suppression: true, mic_gain: false };
        let c = AudioConfig::parse(&args("--mic Headset")).with_prefs(&p);
        assert_eq!((c.mic.as_deref(), c.speaker.as_deref()), (Some("Headset"), None));
        assert!(c.ns && !c.agc);
        let c = AudioConfig::parse(&args("--no-ns")).with_prefs(&p);
        assert_eq!(c.mic.as_deref(), Some("USB"));
        assert!(!c.ns);
    }
}
