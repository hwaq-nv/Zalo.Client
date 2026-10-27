use crate::models::server::ServerInfo;
use crate::services::server::Server;
use tauri::State;

#[tauri::command]
pub fn server_info(server: State<Server>) -> ServerInfo {
    server.info.clone()
}
