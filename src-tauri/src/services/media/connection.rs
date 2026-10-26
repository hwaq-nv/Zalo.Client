use crate::services::media::audio::AudioSession;
use crate::services::media::camera::{CameraCommand, CameraSession};
use crate::services::media::protocol::{self, Control, Outgoing};
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

static CONNECT_LOOP_STARTED: AtomicBool = AtomicBool::new(false);

pub fn connect(url: &str, token: &str) -> Result<(), String> {
    let media_url = ws_url(url, token)?;
    if !CONNECT_LOOP_STARTED.swap(true, Ordering::SeqCst) {
        tauri::async_runtime::spawn(reconnect_loop(media_url));
    }
    Ok(())
}

// Kênh mang mic và camera không mã hoá: chỉ cho nối trong máy
fn ws_url(base: &str, token: &str) -> Result<String, String> {
    let mut url = tauri::Url::parse(base).map_err(|e| e.to_string())?;
    if !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err(format!("media chỉ nối tới server trên máy này, không nối {base}"));
    }
    let scheme = if url.scheme() == "https" { "wss" } else { "ws" };
    url.set_scheme(scheme).map_err(|_| format!("không đổi được scheme của {base}"))?;
    url.set_path("/calls/media/ws");
    url.query_pairs_mut().clear().append_pair("token", token);
    Ok(url.into())
}

async fn reconnect_loop(url: String) {
    loop {
        if let Ok((ws, _)) = tokio_tungstenite::connect_async(url.as_str()).await {
            handle_connection(ws).await;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn handle_connection<S>(ws: tokio_tungstenite::WebSocketStream<S>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let (mut sink, mut stream) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Outgoing>();
    let pending_camera_frames = Arc::new(AtomicUsize::new(0));
    let mut audio: Option<AudioSession> = None;
    let mut camera: Option<CameraSession> = None;
    loop {
        tokio::select! {
            incoming = stream.next() => match incoming {
                Some(Ok(Message::Text(text))) => match serde_json::from_str::<Control>(text.as_str()) {
                    Ok(Control::AudioStart { args }) => audio = Some(AudioSession::start(&args, tx.clone())),
                    Ok(Control::AudioStop) => audio = None,
                    Ok(Control::CameraStart { profile }) => camera = Some(CameraSession::start(profile, tx.clone(), pending_camera_frames.clone())),
                    Ok(Control::CameraProfile { profile }) => camera.iter().for_each(|session| session.send(CameraCommand::SetProfile(profile))),
                    Ok(Control::CameraKey) => camera.iter().for_each(|session| session.send(CameraCommand::RequestKeyframe)),
                    Ok(Control::CameraStop) => camera = None,
                    Err(_) => {}
                },
                Some(Ok(Message::Binary(bytes))) => {
                    if let (Some(session), Some(frame)) = (&audio, protocol::parse_frame(&bytes)) {
                        session.handle_frame(frame);
                    }
                }
                Some(Ok(_)) => {}
                _ => return,
            },
            Some(outgoing) = rx.recv() => {
                let message = match outgoing {
                    Outgoing::Binary(bytes) => {
                        if bytes.first() == Some(&b'C') {
                            pending_camera_frames.fetch_sub(1, Ordering::Relaxed);
                        }
                        Message::binary(bytes)
                    }
                    Outgoing::Text(text) => Message::text(text),
                };
                if sink.send(message).await.is_err() {
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
