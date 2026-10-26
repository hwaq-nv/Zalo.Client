use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "call";

#[tauri::command]
pub async fn open_call_window(app: AppHandle, title: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return w.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(640.0, 480.0)
        .min_inner_size(360.0, 320.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}