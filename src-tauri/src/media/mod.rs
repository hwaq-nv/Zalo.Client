mod audio;
mod camera;
mod protocol;

use audio::AudioSession;
use camera::{CamCmd, CameraSession};
use futures_util::{SinkExt, StreamExt};
use protocol::{Control, Out};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

static STARTED: AtomicBool = AtomicBool::new(false);

// Tên rỗng: thiết bị mặc định
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub mic: String,
    pub speaker: String,
    pub camera: String,
    pub noise_suppression: bool,
    pub mic_gain: bool,
}

// Trước khi app gửi Cài đặt. Lọc ồn tắt: lý do ở docstring của audio-io.py
static PREFS: Mutex<Prefs> = Mutex::new(Prefs { mic: String::new(), speaker: String::new(), camera: String::new(), noise_suppression: false, mic_gain: true });

pub fn prefs() -> Prefs {
    PREFS.lock().unwrap().clone()
}

#[tauri::command]
pub fn media_prefs(prefs: Prefs) {
    *PREFS.lock().unwrap() = prefs;
}

#[derive(Serialize)]
pub struct DeviceList {
    mics: Vec<String>,
    speakers: Vec<String>,
    cameras: Vec<String>,
}

#[tauri::command]
pub async fn media_devices() -> Result<DeviceList, String> {
    tauri::async_runtime::spawn_blocking(|| DeviceList { mics: audio::device_names(true), speakers: audio::device_names(false), cameras: camera::names() })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn media_connect(url: String, token: String) -> Result<(), String> {
    let ws = ws_url(&url, &token)?;
    if !STARTED.swap(true, Ordering::SeqCst) {
        tauri::async_runtime::spawn(run(ws));
    }
    Ok(())
}

// Kênh mang mic và camera không mã hoá: chỉ cho nối trong máy
fn ws_url(base: &str, token: &str) -> Result<String, String> {
    let mut u = tauri::Url::parse(base).map_err(|e| e.to_string())?;
    if !matches!(u.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err(format!("media chỉ nối tới server trên máy này, không nối {base}"));
    }
    let scheme = if u.scheme() == "https" { "wss" } else { "ws" };
    u.set_scheme(scheme).map_err(|_| format!("không đổi được scheme của {base}"))?;
    u.set_path("/calls/media/ws");
    u.query_pairs_mut().clear().append_pair("token", token);
    Ok(u.into())
}

async fn run(url: String) {
    loop {
        if let Ok((ws, _)) = tokio_tungstenite::connect_async(url.as_str()).await {
            session(ws).await;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn session<S>(ws: tokio_tungstenite::WebSocketStream<S>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let (mut sink, mut stream) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Out>();
    let pending = Arc::new(AtomicUsize::new(0));
    let mut audio: Option<AudioSession> = None;
    let mut camera: Option<CameraSession> = None;
    loop {
        tokio::select! {
            m = stream.next() => match m {
                Some(Ok(Message::Text(t))) => match serde_json::from_str::<Control>(t.as_str()) {
                    Ok(Control::AudioStart { args }) => audio = Some(AudioSession::start(&args, tx.clone())),
                    Ok(Control::AudioStop) => audio = None,
                    Ok(Control::CameraStart { profile }) => camera = Some(CameraSession::start(profile, tx.clone(), pending.clone())),
                    Ok(Control::CameraProfile { profile }) => camera.iter().for_each(|c| c.send(CamCmd::Profile(profile))),
                    Ok(Control::CameraKey) => camera.iter().for_each(|c| c.send(CamCmd::Key)),
                    Ok(Control::CameraStop) => camera = None,
                    Err(_) => {}
                },
                Some(Ok(Message::Binary(b))) => {
                    if let (Some(a), Some(f)) = (&audio, protocol::parse_frame(&b)) {
                        a.frame(f);
                    }
                }
                Some(Ok(_)) => {}
                _ => return,
            },
            Some(o) = rx.recv() => {
                let msg = match o {
                    Out::Bin(b) => {
                        if b.first() == Some(&b'C') {
                            pending.fetch_sub(1, Ordering::Relaxed);
                        }
                        Message::binary(b)
                    }
                    Out::Text(t) => Message::text(t),
                };
                if sink.send(msg).await.is_err() {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_url_is_loopback_only() {
        assert_eq!(ws_url("http://127.0.0.1:3000", "dev").unwrap(), "ws://127.0.0.1:3000/calls/media/ws?token=dev");
        assert_eq!(ws_url("http://localhost:3000/", "a b").unwrap(), "ws://localhost:3000/calls/media/ws?token=a+b");
        assert!(ws_url("http://192.168.1.5:3000", "dev").is_err());
        assert!(ws_url("https://example.com", "dev").is_err());
    }
}
