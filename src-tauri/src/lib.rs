// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod models;
mod services;
mod utils;

use commands::{call_window, file_viewer, media};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, media::media_connect, media::media_prefs, media::media_devices, call_window::open_call_window,
            file_viewer::open_viewer, file_viewer::viewer_file, file_viewer::download_file, file_viewer::zip_entries, file_viewer::zip_extract, file_viewer::save_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
