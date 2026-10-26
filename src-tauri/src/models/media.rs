use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPrefs {
    pub mic: String,
    pub speaker: String,
    pub camera: String,
    pub noise_suppression: bool,
    pub mic_gain: bool,
}

#[derive(Serialize)]
pub struct DeviceList {
    pub mics: Vec<String>,
    pub speakers: Vec<String>,
    pub cameras: Vec<String>,
}
