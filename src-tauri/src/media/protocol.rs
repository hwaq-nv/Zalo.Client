use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u32,
    pub key_ms: u32,
}

#[derive(Debug, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Control {
    AudioStart { args: Vec<String> },
    AudioStop,
    CameraStart { profile: Profile },
    CameraProfile { profile: Profile },
    CameraKey,
    CameraStop,
}

#[derive(Debug, PartialEq)]
pub enum Frame<'a> {
    Packet { idx: u32, src: u32, opus: &'a [u8] },
    Mute(bool),
    SpeakerOff(bool),
    MicVolume(u8),
    Device { mic: bool, name: String },
}

pub enum Out {
    Bin(Vec<u8>),
    Text(String),
}

fn be32(b: &[u8]) -> u32 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}

fn be16(b: &[u8]) -> usize {
    u16::from_be_bytes([b[0], b[1]]) as usize
}

pub fn parse_frame(b: &[u8]) -> Option<Frame<'_>> {
    match *b.first()? {
        b'F' if b.len() >= 11 => Some(Frame::Packet { idx: be32(&b[1..]), src: be32(&b[5..]), opus: b.get(11..11 + be16(&b[9..]))? }),
        b'M' => Some(Frame::Mute(*b.get(1)? != 0)),
        b'S' => Some(Frame::SpeakerOff(*b.get(1)? != 0)),
        b'V' => Some(Frame::MicVolume(*b.get(1)?)),
        b'D' if b.len() >= 4 && matches!(b[1], b'i' | b'o') => {
            let name = String::from_utf8_lossy(b.get(4..4 + be16(&b[2..]))?).into_owned();
            Some(Frame::Device { mic: b[1] == b'i', name })
        }
        _ => None,
    }
}

pub fn mic_frame(level: u8, opus: &[u8]) -> Out {
    let mut v = vec![b'L', level];
    v.extend_from_slice(&(opus.len() as u16).to_be_bytes());
    v.extend_from_slice(opus);
    Out::Bin(v)
}

pub fn camera_frame(key: bool, data: &[u8]) -> Out {
    let mut v = vec![b'C', key as u8];
    v.extend_from_slice(data);
    Out::Bin(v)
}

pub fn camera_started() -> Out {
    Out::Text(r#"{"type":"camera-started"}"#.into())
}

pub fn fault(kind: &str, why: &str) -> Out {
    Out::Text(serde_json::json!({ "type": "fault", "kind": kind, "why": why }).to_string())
}

pub fn log(line: impl Into<String>) -> Out {
    Out::Text(serde_json::json!({ "type": "log", "line": line.into() }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_server_frames() {
        let f = [b'F', 0, 1, 0, 2, 0, 0, 0, 7, 0, 2, 0xaa, 0xbb];
        assert_eq!(parse_frame(&f), Some(Frame::Packet { idx: 0x0001_0002, src: 7, opus: &[0xaa, 0xbb] }));
        assert_eq!(parse_frame(&[b'M', 1]), Some(Frame::Mute(true)));
        assert_eq!(parse_frame(&[b'S', 0]), Some(Frame::SpeakerOff(false)));
        assert_eq!(parse_frame(&[b'D', b'o', 0, 2, b'h', b'w']), Some(Frame::Device { mic: false, name: "hw".into() }));
        assert_eq!(parse_frame(&[b'D', b'x', 0, 0]), None);
        assert_eq!(parse_frame(&[b'F', 0, 1]), None);
    }

    #[test]
    fn parses_control() {
        let c: Control = serde_json::from_str(r#"{"type":"camera-start","profile":{"width":640,"height":360,"fps":15,"bitrate":500000,"keyMs":1000}}"#).unwrap();
        assert_eq!(c, Control::CameraStart { profile: Profile { width: 640, height: 360, fps: 15, bitrate: 500_000, key_ms: 1000 } });
        let c: Control = serde_json::from_str(r#"{"type":"audio-start","args":["--mix"]}"#).unwrap();
        assert_eq!(c, Control::AudioStart { args: vec!["--mix".into()] });
    }

    #[test]
    fn builds_app_frames() {
        let Out::Bin(b) = mic_frame(40, &[1, 2, 3]) else { panic!() };
        assert_eq!(b, [b'L', 40, 0, 3, 1, 2, 3]);
        let Out::Bin(b) = camera_frame(true, &[0, 0, 0, 1, 0x65]) else { panic!() };
        assert_eq!(b, [b'C', 1, 0, 0, 0, 1, 0x65]);
    }
}
