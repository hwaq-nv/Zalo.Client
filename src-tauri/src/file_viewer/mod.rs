mod archive;

use archive::ZipEntry;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "viewer";

type Res<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerFile {
    name: String,
    ext: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

// Cửa sổ mới hỏi lại file hiện tại, vì event phát lúc cửa sổ chưa listen sẽ mất
static CURRENT: Mutex<Option<ViewerFile>> = Mutex::new(None);

#[tauri::command]
pub async fn open_viewer(app: AppHandle, file: ViewerFile) -> Result<(), String> {
    let title = file.name.clone();
    *CURRENT.lock().unwrap() = Some(file.clone());
    if let Some(w) = app.get_webview_window(LABEL) {
        app.emit_to(LABEL, "viewer:open", file).map_err(|e| e.to_string())?;
        w.set_title(&title).map_err(|e| e.to_string())?;
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(960.0, 720.0)
        .min_inner_size(400.0, 300.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn viewer_file() -> Option<ViewerFile> {
    CURRENT.lock().unwrap().clone()
}

#[tauri::command]
pub async fn download_file(app: AppHandle, url: String, name: String, progress: Channel<u8>) -> Result<String, String> {
    let dest = cache(&app, "files")?.join(format!("{:016x}", fnv(url.as_bytes()))).join(safe_name(&name));
    blocking(move || download(&url, &dest, |p| drop(progress.send(p)))).await.map(display)
}

#[tauri::command]
pub async fn zip_entries(app: AppHandle, path: String) -> Result<Vec<ZipEntry>, String> {
    let zip = in_cache(&app, &path)?;
    blocking(move || archive::list(&zip)).await
}

#[tauri::command]
pub async fn zip_extract(app: AppHandle, path: String, name: String) -> Result<String, String> {
    let zip = in_cache(&app, &path)?;
    let key = fnv(format!("{}\0{name}", zip.display()).as_bytes());
    let dest = cache(&app, "zip")?.join(format!("{key:016x}")).join(safe_name(&name));
    blocking(move || archive::extract(&zip, &name, &dest)).await.map(display)
}

#[tauri::command]
pub async fn save_file(app: AppHandle, src: String, dest: String) -> Result<(), String> {
    let src = in_cache(&app, &src)?;
    fs::copy(src, dest).map(drop).map_err(|e| e.to_string())
}

fn download(url: &str, dest: &Path, progress: impl Fn(u8)) -> Res<PathBuf> {
    write_cached(dest, |out| {
        let res = ureq::get(url).call()?;
        let total = res.body().content_length().filter(|&t| t > 0);
        let mut body = res.into_body().into_reader();
        let (mut buf, mut done, mut last) = (vec![0; 64 * 1024], 0u64, 0u8);
        loop {
            let n = body.read(&mut buf)?;
            if n == 0 {
                return Ok(());
            }
            out.write_all(&buf[..n])?;
            done += n as u64;
            // gzip: số byte giải nén có thể vượt content-length
            if let Some(p) = total.map(|t| (done * 100 / t).min(100) as u8).filter(|&p| p != last) {
                last = p;
                progress(p);
            }
        }
    })
}

// Ghi vào file .part rồi mới đổi tên: file dở dang không bao giờ bị coi là đã có trong cache
fn write_cached(dest: &Path, write: impl FnOnce(&mut File) -> Res<()>) -> Res<PathBuf> {
    static N: AtomicU64 = AtomicU64::new(0);
    if dest.exists() {
        return Ok(dest.into());
    }
    fs::create_dir_all(dest.parent().ok_or("thiếu thư mục cha")?)?;
    let mut tmp = dest.as_os_str().to_owned();
    tmp.push(format!(".{}.part", N.fetch_add(1, Ordering::Relaxed)));
    let r = File::create(&tmp).map_err(Into::into).and_then(|mut f| write(&mut f));
    if let Err(e) = r.and_then(|_| fs::rename(&tmp, dest).map_err(Into::into)) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    mark_downloaded(dest);
    Ok(dest.into())
}

// Mark-of-the-Web như trình duyệt: Windows cảnh báo khi mở .exe, .bat, ... lấy từ Zalo
#[cfg(windows)]
fn mark_downloaded(path: &Path) {
    let mut ads = path.as_os_str().to_owned();
    ads.push(":Zone.Identifier");
    let _ = fs::write(ads, "[ZoneTransfer]\r\nZoneId=3\r\n");
}

#[cfg(not(windows))]
fn mark_downloaded(_: &Path) {}

fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let s: String = base.chars().map(|c| if c.is_control() || r#"<>:"|?*"#.contains(c) { '_' } else { c }).collect();
    match s.trim_end_matches(['.', ' ']) {
        "" => "file".into(),
        s => s.into(),
    }
}

// FNV-1a: ổn định giữa các lần chạy, khác DefaultHasher
fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |h, &b| (h ^ b as u64).wrapping_mul(0x100000001b3))
}

fn display(p: PathBuf) -> String {
    p.to_string_lossy().into_owned()
}

fn cache(app: &AppHandle, sub: &str) -> Result<PathBuf, String> {
    app.path().app_cache_dir().map(|d| d.join(sub)).map_err(|e| e.to_string())
}

fn in_cache(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let root = cache(app, "")?.canonicalize().map_err(|e| e.to_string())?;
    let p = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    if p.starts_with(root) { Ok(p) } else { Err("file nằm ngoài cache".into()) }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::safe_name;

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("../a/b:c.txt"), "b_c.txt");
        assert_eq!(safe_name("..\\x?.pdf"), "x_.pdf");
        assert_eq!(safe_name(".."), "file");
        assert_eq!(safe_name("bao cao. "), "bao cao");
        assert_eq!(safe_name("Báo cáo quý 3.pdf"), "Báo cáo quý 3.pdf");
    }
}
