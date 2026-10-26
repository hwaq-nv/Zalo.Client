use crate::models::media::{DeviceList, MediaPrefs};
use crate::services::media::{audio, camera, connection, prefs};

#[tauri::command]
pub fn media_prefs(prefs: MediaPrefs) {
    prefs::set_prefs(prefs);
}

#[tauri::command]
pub async fn media_devices() -> Result<DeviceList, String> {
    tauri::async_runtime::spawn_blocking(|| DeviceList { mics: audio::device_names(true), speakers: audio::device_names(false), cameras: camera::device_names() })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn media_connect(url: String, token: String) -> Result<(), String> {
    connection::connect(&url, &token)
}
