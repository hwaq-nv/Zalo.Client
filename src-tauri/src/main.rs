// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("GST_PLUGIN_FEATURE_RANK").is_none() {
        unsafe { std::env::set_var("GST_PLUGIN_FEATURE_RANK", "nvh264dec:NONE,vah264dec:NONE") };
    }
    client_lib::run()
}
