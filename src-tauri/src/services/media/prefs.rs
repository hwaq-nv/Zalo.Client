use crate::models::media::MediaPrefs;
use std::sync::Mutex;

// Trước khi app gửi Cài đặt. Lọc ồn tắt: lý do ở docstring của audio-io.py
static PREFS: Mutex<MediaPrefs> = Mutex::new(MediaPrefs { mic: String::new(), speaker: String::new(), camera: String::new(), noise_suppression: false, mic_gain: true });

pub fn current_prefs() -> MediaPrefs {
    PREFS.lock().unwrap().clone()
}

pub fn set_prefs(prefs: MediaPrefs) {
    *PREFS.lock().unwrap() = prefs;
}
