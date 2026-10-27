use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
pub struct ServerInfo {
    pub port: u16,
    pub token: String,
}
