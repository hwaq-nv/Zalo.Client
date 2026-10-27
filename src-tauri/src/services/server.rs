use crate::models::server::ServerInfo;
use crate::utils::AnyResult;
use std::io::{self, BufRead, BufReader};
use std::process::{ChildStdin, Command, Stdio};
use tauri::AppHandle;

pub struct Server {
    pub info: ServerInfo,
    _stdin: ChildStdin,
}

pub fn start(app: &AppHandle) -> AnyResult<Server> {
    let mut command = command(app)?;
    #[cfg(target_os = "linux")]
    leave_appimage(&mut command);
    let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).spawn()?;
    let mut stdout = BufReader::new(child.stdout.take().ok_or("server không có stdout")?);
    let mut line = String::new();
    let info = loop {
        line.clear();
        if stdout.read_line(&mut line)? == 0 {
            return Err("server thoát trước khi sẵn sàng".into());
        }
        if let Some(json) = line.strip_prefix("READY ") {
            break serde_json::from_str(json)?;
        }
        print!("{line}");
    };
    std::thread::spawn(move || io::copy(&mut stdout, &mut io::stdout()));
    Ok(Server { info, _stdin: child.stdin.take().ok_or("server không có stdin")? })
}

#[cfg(target_os = "linux")]
fn leave_appimage(command: &mut Command) {
    let Some(appdir) = std::env::var("APPDIR").ok().filter(|d| !d.is_empty()) else { return };
    for (key, value) in std::env::vars_os() {
        let Some(value) = value.to_str().filter(|v| v.contains(&appdir)) else { continue };
        match without_appdir(value, &appdir) {
            Some(value) => command.env(key, value),
            None => command.env_remove(key),
        };
    }
}

#[cfg(target_os = "linux")]
fn without_appdir(value: &str, appdir: &str) -> Option<String> {
    let rest: Vec<&str> = value.split(':').filter(|p| !p.is_empty() && !p.starts_with(appdir)).collect();
    (!rest.is_empty()).then(|| rest.join(":"))
}

#[cfg(debug_assertions)]
fn command(_: &AppHandle) -> AnyResult<Command> {
    let mut command = Command::new("bun");
    command
        .args(["run", "--watch", "src/index.ts"])
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../server"))
        .env("PORT", "3000")
        .env("APP_TOKEN", "dev");
    Ok(command)
}

#[cfg(not(debug_assertions))]
fn command(app: &AppHandle) -> AnyResult<Command> {
    use tauri::Manager;
    let exe = std::env::current_exe()?.with_file_name(format!("zalo-server{}", std::env::consts::EXE_SUFFIX));
    let mut command = Command::new(exe);
    command.env("DATA_DIR", app.path().app_data_dir()?).env("PORT", "0").env_remove("APP_TOKEN");
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0800_0000); // CREATE_NO_WINDOW
    Ok(command)
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::without_appdir;

    #[test]
    fn strips_appimage_paths() {
        let d = "/tmp/.mount_x";
        assert_eq!(without_appdir("/tmp/.mount_x/usr/", d), None);
        assert_eq!(without_appdir("/tmp/.mount_x/usr/share/pyshared/:", d), None);
        assert_eq!(without_appdir("/tmp/.mount_x/usr/lib/:/opt/lib", d).as_deref(), Some("/opt/lib"));
        assert_eq!(without_appdir("/tmp/.mount_x/usr/share:/usr/share:/usr/local/share", d).as_deref(), Some("/usr/share:/usr/local/share"));
    }
}
