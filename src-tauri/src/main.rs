// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    for (key, value) in [
        ("GST_PLUGIN_FEATURE_RANK", "nvh264dec:NONE,vah264dec:NONE"),
        ("WEBKIT_USE_SKIA_FOR_COMPOSITION", "0"),
        ("WEBKIT_DISABLE_DMABUF_ATLAS", "1"),
    ] {
        if std::env::var_os(key).is_none() {
            unsafe { std::env::set_var(key, value) };
        }
    }
    client_lib::run()
}
