// Port của _Stream và Playout trong audio-io.py: mã Python là đặc tả, hằng số giữ nguyên
use opus::{Channels, Decoder};
use std::collections::{BTreeMap, HashMap, VecDeque};

pub const FRAME: usize = 320;
const START_TARGET: usize = 5;
const MAX_EXPAND: u32 = 5;
const WINDOW: usize = 250;
const IDLE_SECS: f64 = 5.0;
const LIMIT: f32 = 26000.0;

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Stats {
    pub opus_ok: u32,
    pub opus_fail: u32,
    pub lost: u32,
    pub fec: u32,
    pub plc: u32,
    pub underrun: u32,
    pub accelerate: u32,
    pub reset: u32,
    pub late: u32,
    pub dup: u32,
}

struct Stream {
    dec: Decoder,
    pcm: Vec<i16>,
    packets: BTreeMap<i64, Vec<u8>>,
    next: Option<i64>,
    playing: bool,
    expand: u32,
    carry: Vec<i16>,
    transit: VecDeque<f64>,
    target: usize,
    min_target: usize,
    max_target: usize,
    last: f64,
    since_drop: u32,
}

impl Stream {
    fn new(min_target: usize, max_target: usize, now: f64) -> Self {
        let min_target = min_target.max(2);
        Self {
            dec: Decoder::new(16_000, Channels::Mono).expect("opus decoder"),
            pcm: vec![0; 1920],
            packets: BTreeMap::new(),
            next: None,
            playing: false,
            expand: 0,
            carry: Vec::new(),
            transit: VecDeque::with_capacity(WINDOW),
            target: START_TARGET.max(min_target),
            min_target,
            max_target: min_target.max(max_target),
            last: now,
            since_drop: 0,
        }
    }

    fn push(&mut self, idx: i64, payload: &[u8], now: f64, st: &mut Stats) {
        self.last = now;
        if self.next.is_some_and(|n| idx < n) {
            st.late += 1;
            return;
        }
        if self.packets.contains_key(&idx) {
            st.dup += 1;
            return;
        }
        self.packets.insert(idx, payload.to_vec());
        if self.transit.len() == WINDOW {
            self.transit.pop_front();
        }
        self.transit.push_back(now - idx as f64 * 0.02);
        if self.transit.len() >= 20 {
            let mut t: Vec<f64> = self.transit.iter().copied().collect();
            t.sort_by(f64::total_cmp);
            let spread = t[(t.len() as f64 * 0.95) as usize - 1] - t[0];
            self.target = ((spread / 0.02).ceil() as usize + 1).clamp(self.min_target, self.max_target);
        }
    }

    fn decode(&mut self, payload: Option<&[u8]>, fec: bool, st: &mut Stats) -> Vec<i16> {
        let size = if fec || payload.is_none() { FRAME } else { self.pcm.len() };
        match self.dec.decode(payload.unwrap_or(&[]), &mut self.pcm[..size], fec) {
            Ok(n) if n > 0 => self.pcm[..n].to_vec(),
            _ => {
                st.opus_fail += 1;
                vec![0; FRAME]
            }
        }
    }

    fn take(&mut self) -> Vec<i16> {
        let mut out = self.carry.split_off(FRAME.min(self.carry.len()));
        std::mem::swap(&mut out, &mut self.carry);
        out.resize(FRAME, 0);
        out
    }

    fn emit(&mut self, pcm: Vec<i16>) -> Vec<i16> {
        self.carry.extend(pcm);
        self.take()
    }

    fn ensure(&mut self, n: usize, st: &mut Stats) -> bool {
        while self.carry.len() < n {
            let Some(next) = self.next else { break };
            let Some(p) = self.packets.remove(&next) else { break };
            let pcm = self.decode(Some(&p), false, st);
            self.carry.extend(pcm);
            self.next = Some(next + 1);
            self.expand = 0;
            st.opus_ok += 1;
        }
        self.carry.len() >= n
    }

    fn span(&self) -> usize {
        match (self.packets.last_key_value(), self.next) {
            (Some((&last, _)), Some(next)) => (last - next + 1).max(0) as usize,
            _ => 0,
        }
    }

    fn pull(&mut self, st: &mut Stats) -> Option<Vec<i16>> {
        if !self.playing {
            if self.carry.is_empty() && self.packets.len() < self.target {
                return None;
            }
            self.playing = true;
            if let Some((&first, _)) = self.packets.first_key_value()
                && self.next.is_none_or(|n| first > n)
            {
                self.next = Some(first);
            }
        }
        self.since_drop += 1;
        if self.span() > self.target + 10 {
            self.discard_to(self.target, st);
        }
        if self.span() > self.target + 2 && self.since_drop >= 10 && self.ensure(FRAME * 2, st) && rms(&self.carry[..FRAME]) < 800.0 {
            self.since_drop = 0;
            st.accelerate += 1;
            let (played, rest) = wsola_shrink(&self.carry);
            self.carry = rest;
            return Some(played);
        }
        if self.ensure(FRAME, st) {
            return Some(self.take());
        }
        if !self.packets.is_empty() && (self.packets.len() >= self.target || self.expand >= MAX_EXPAND) {
            self.expand = 0;
            st.lost += 1;
            let next = self.next.unwrap_or(0) + 1;
            self.next = Some(next);
            if let Some(p) = self.packets.get(&next).cloned() {
                st.fec += 1;
                let pcm = self.decode(Some(&p), true, st);
                return Some(self.emit(pcm));
            }
            st.plc += 1;
            let pcm = self.decode(None, false, st);
            return Some(self.emit(pcm));
        }
        st.underrun += 1;
        if self.expand < MAX_EXPAND {
            self.expand += 1;
            st.plc += 1;
            let pcm = self.decode(None, false, st);
            return Some(self.emit(pcm));
        }
        self.expand = 0;
        self.playing = false;
        None
    }

    fn discard_to(&mut self, keep: usize, st: &mut Stats) -> usize {
        let (Some((&last, _)), Some(next)) = (self.packets.last_key_value(), self.next) else { return 0 };
        let extra = last - next + 1 - keep as i64;
        if extra <= 0 {
            return 0;
        }
        let cut = next + extra;
        self.packets = self.packets.split_off(&cut);
        self.next = Some(self.packets.first_key_value().map_or(cut, |(&k, _)| k));
        self.carry.clear();
        self.expand = 0;
        st.reset += 1;
        extra as usize
    }
}

fn rms(pcm: &[i16]) -> f64 {
    if pcm.is_empty() {
        return 0.0;
    }
    (pcm.iter().map(|&v| (v as f64) * (v as f64)).sum::<f64>() / pcm.len() as f64).sqrt()
}

fn pitch_lag(s: &[i16]) -> usize {
    let window = 80;
    let limit = 160.min(s.len().saturating_sub(window + 1));
    if limit < 40 {
        return 80;
    }
    let mut best: Option<i64> = None;
    let mut best_lag = 80;
    for lag in (40..=limit).step_by(2) {
        let score: i64 = (0..window).map(|i| s[i] as i64 * s[i + lag] as i64).sum();
        if best.is_none_or(|b| score > b) {
            best = Some(score);
            best_lag = lag;
        }
    }
    best_lag
}

fn wsola_shrink(s: &[i16]) -> (Vec<i16>, Vec<i16>) {
    if s.len() < FRAME * 2 {
        let mut played = s[..FRAME.min(s.len())].to_vec();
        played.resize(FRAME, 0);
        return (played, s.get(FRAME..).unwrap_or(&[]).to_vec());
    }
    let lag = pitch_lag(s);
    let mut out = vec![0i16; s.len() - lag];
    for i in 0..lag {
        let w = (i + 1) as f64 / (lag + 1) as f64;
        out[i] = (s[i] as f64 * (1.0 - w) + s[i + lag] as f64 * w).round().clamp(-32768.0, 32767.0) as i16;
    }
    out[lag..].copy_from_slice(&s[2 * lag..]);
    let rest = out.split_off(FRAME);
    (out, rest)
}

pub struct Playout {
    sources: HashMap<u32, Stream>,
    min_target: usize,
    max_target: usize,
    lim: f32,
    pub stats: Stats,
    pub notes: Vec<String>,
}

impl Playout {
    pub fn new(min_target: usize, max_target: usize) -> Self {
        Self { sources: HashMap::new(), min_target, max_target, lim: 1.0, stats: Stats::default(), notes: Vec::new() }
    }

    pub fn push(&mut self, idx: u32, src: u32, opus: &[u8], now: f64) {
        let (min, max) = (self.min_target, self.max_target);
        let s = self.sources.entry(src).or_insert_with(|| {
            self.notes.push(format!("playout: new source {src}"));
            Stream::new(min, max, now)
        });
        s.push(idx as i64, opus, now, &mut self.stats);
    }

    pub fn pull(&mut self, now: f64) -> [i16; FRAME] {
        let notes = &mut self.notes;
        self.sources.retain(|src, s| {
            let gone = now - s.last > IDLE_SECS && s.packets.is_empty() && s.carry.is_empty();
            if gone {
                notes.push(format!("playout: source {src} gone"));
            }
            !gone
        });
        let mut acc = [0i32; FRAME];
        let mut voices = 0;
        for s in self.sources.values_mut() {
            let resets = self.stats.reset;
            if let Some(pcm) = s.pull(&mut self.stats) {
                voices += 1;
                for (a, v) in acc.iter_mut().zip(pcm) {
                    *a += v as i32;
                }
            }
            if self.stats.reset > resets {
                self.notes.push("playout: buffer reset".into());
            }
        }
        if voices == 0 {
            return [0; FRAME];
        }
        self.limit(&acc, voices)
    }

    fn limit(&mut self, acc: &[i32; FRAME], voices: usize) -> [i16; FRAME] {
        let mut out = [0i16; FRAME];
        if voices < 2 {
            for (o, &v) in out.iter_mut().zip(acc) {
                *o = v.clamp(-32768, 32767) as i16;
            }
            self.lim += (1.0 - self.lim) * 0.1;
            return out;
        }
        let peak = acc.iter().map(|v| v.unsigned_abs()).max().unwrap_or(0) as f32;
        let target = if peak <= LIMIT { 1.0 } else { LIMIT / peak };
        if target < self.lim {
            self.lim = target;
        } else {
            self.lim += (target - self.lim) * 0.1;
        }
        for (o, &v) in out.iter_mut().zip(acc) {
            *o = ((v as f32 * self.lim) as i32).clamp(-32768, 32767) as i16;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opus::{Application, Encoder};

    fn packets(n: usize, amp: f64) -> Vec<Vec<u8>> {
        let mut enc = Encoder::new(16_000, Channels::Mono, Application::Voip).unwrap();
        enc.set_inband_fec(true).unwrap();
        enc.set_packet_loss_perc(5).unwrap();
        (0..n)
            .map(|k| {
                let pcm: Vec<i16> = (0..FRAME).map(|i| (amp * (2.0 * std::f64::consts::PI * 440.0 * (k * FRAME + i) as f64 / 16_000.0).sin()) as i16).collect();
                enc.encode_vec(&pcm, 1500).unwrap()
            })
            .collect()
    }

    fn feed(p: &mut Playout, pk: &[Vec<u8>], order: &[usize]) {
        for &i in order {
            p.push(i as u32, 7, &pk[i], i as f64 * 0.02);
        }
    }

    #[test]
    fn plays_in_order_after_buffering() {
        let pk = packets(10, 8000.0);
        let mut p = Playout::new(5, 10);
        feed(&mut p, &pk, &[0, 1, 2, 3]);
        assert_eq!(p.pull(0.1), [0; FRAME], "chưa đủ 5 gói thì chưa phát");
        feed(&mut p, &pk, &[4, 5, 6, 7, 8, 9]);
        let loud = (0..10).filter(|_| p.pull(0.2).iter().any(|&v| v.abs() > 1000)).count();
        assert!(loud >= 8);
        assert_eq!(p.stats.opus_ok, 10);
        assert_eq!(p.stats.lost, 0);
    }

    #[test]
    fn reordered_packets_are_not_lost() {
        let pk = packets(8, 8000.0);
        let mut p = Playout::new(5, 10);
        feed(&mut p, &pk, &[0, 2, 1, 4, 3, 5, 7, 6]);
        for _ in 0..8 {
            p.pull(0.2);
        }
        assert_eq!(p.stats.lost, 0);
        assert_eq!(p.stats.opus_ok, 8);
    }

    #[test]
    fn a_lost_packet_is_rebuilt_from_fec() {
        let pk = packets(10, 8000.0);
        let mut p = Playout::new(5, 10);
        feed(&mut p, &pk, &[0, 1, 2, 4, 5, 6, 7, 8, 9]);
        for _ in 0..9 {
            p.pull(0.2);
        }
        assert_eq!(p.stats.lost, 1);
        assert_eq!(p.stats.fec, 1);
    }

    #[test]
    fn a_late_packet_is_dropped() {
        let pk = packets(8, 8000.0);
        let mut p = Playout::new(5, 10);
        feed(&mut p, &pk, &[0, 1, 2, 3, 4, 5]);
        for _ in 0..4 {
            p.pull(0.2);
        }
        p.push(1, 7, &pk[1], 0.3);
        assert_eq!(p.stats.late, 1);
    }

    #[test]
    fn two_loud_voices_do_not_clip() {
        let mut p = Playout::new(5, 10);
        let acc = [60_000i32; FRAME];
        let out = p.limit(&acc, 2);
        assert!(out.iter().all(|&v| v as f32 <= LIMIT + 1.0));
    }

    #[test]
    fn shrink_drops_one_pitch_period() {
        let s: Vec<i16> = (0..FRAME * 2).map(|i| (8000.0 * (2.0 * std::f64::consts::PI * 200.0 * i as f64 / 16_000.0).sin()) as i16).collect();
        let (played, rest) = wsola_shrink(&s);
        assert_eq!(played.len(), FRAME);
        assert!(rest.len() < FRAME && rest.len() >= FRAME - 160);
    }
}
