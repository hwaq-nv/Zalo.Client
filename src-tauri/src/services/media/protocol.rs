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

pub enum Outgoing {
    Binary(Vec<u8>),
    Text(String),
}

fn read_u32_be(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn read_u16_be(bytes: &[u8]) -> usize {
    u16::from_be_bytes([bytes[0], bytes[1]]) as usize
}

pub fn parse_frame(data: &[u8]) -> Option<Frame<'_>> {
    match *data.first()? {
        b'F' if data.len() >= 11 => Some(Frame::Packet { idx: read_u32_be(&data[1..]), src: read_u32_be(&data[5..]), opus: data.get(11..11 + read_u16_be(&data[9..]))? }),
        b'M' => Some(Frame::Mute(*data.get(1)? != 0)),
        b'S' => Some(Frame::SpeakerOff(*data.get(1)? != 0)),
        b'V' => Some(Frame::MicVolume(*data.get(1)?)),
        b'D' if data.len() >= 4 && matches!(data[1], b'i' | b'o') => {
            let name = String::from_utf8_lossy(data.get(4..4 + read_u16_be(&data[2..]))?).into_owned();
            Some(Frame::Device { mic: data[1] == b'i', name })
        }
        _ => None,
    }
}

pub fn mic_frame(level: u8, opus: &[u8]) -> Outgoing {
    let mut frame = vec![b'L', level];
    frame.extend_from_slice(&(opus.len() as u16).to_be_bytes());
    frame.extend_from_slice(opus);
    Outgoing::Binary(frame)
}

pub fn camera_frame(key: bool, data: &[u8]) -> Outgoing {
    let mut frame = vec![b'C', key as u8];
    frame.extend_from_slice(data);
    Outgoing::Binary(frame)
}

pub fn camera_started() -> Outgoing {
    Outgoing::Text(r#"{"type":"camera-started"}"#.into())
}

pub fn fault(kind: &str, why: &str) -> Outgoing {
    Outgoing::Text(serde_json::json!({ "type": "fault", "kind": kind, "why": why }).to_string())
}

pub fn log(line: impl Into<String>) -> Outgoing {
    Outgoing::Text(serde_json::json!({ "type": "log", "line": line.into() }).to_string())
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
        let Outgoing::Binary(b) = mic_frame(40, &[1, 2, 3]) else { panic!() };
        assert_eq!(b, [b'L', 40, 0, 3, 1, 2, 3]);
        let Outgoing::Binary(b) = camera_frame(true, &[0, 0, 0, 1, 0x65]) else { panic!() };
        assert_eq!(b, [b'C', 1, 0, 0, 0, 1, 0x65]);
    }
}
