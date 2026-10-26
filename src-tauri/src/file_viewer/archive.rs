use super::{write_cached, Res};
use serde::Serialize;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Serialize)]
pub struct ZipEntry {
    name: String,
    size: u64,
    dir: bool,
}

pub fn list(zip: &Path) -> Res<Vec<ZipEntry>> {
    let mut z = ZipArchive::new(File::open(zip)?)?;
    (0..z.len())
        .map(|i| {
            let f = z.by_index_raw(i)?;
            Ok(ZipEntry { name: f.name().into(), size: f.size(), dir: f.is_dir() })
        })
        .collect()
}

pub fn extract(zip: &Path, name: &str, dest: &Path) -> Res<PathBuf> {
    let mut z = ZipArchive::new(File::open(zip)?)?;
    let mut f = z.by_name(name)?;
    if f.is_dir() || f.enclosed_name().is_none() {
        return Err(format!("mục không hợp lệ: {name}").into());
    }
    write_cached(dest, |out| {
        io::copy(&mut f, out)?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn list_and_extract() {
        let dir = std::env::temp_dir().join(format!("zalo-viewer-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let zip = dir.join("t.zip");
        let mut w = zip::ZipWriter::new(File::create(&zip).unwrap());
        w.add_directory("d/", SimpleFileOptions::default()).unwrap();
        w.start_file("d/a.txt", SimpleFileOptions::default()).unwrap();
        w.write_all(b"hello").unwrap();
        w.start_file("../x", SimpleFileOptions::default()).unwrap();
        w.write_all(b"evil").unwrap();
        w.finish().unwrap();

        let names: Vec<_> = list(&zip).unwrap().into_iter().map(|e| (e.name, e.size, e.dir)).collect();
        assert_eq!(names, [("d/".into(), 0, true), ("d/a.txt".into(), 5, false), ("../x".into(), 4, false)]);

        let out = extract(&zip, "d/a.txt", &dir.join("out/a.txt")).unwrap();
        assert_eq!(std::fs::read_to_string(out).unwrap(), "hello");
        assert!(extract(&zip, "../x", &dir.join("out/x")).is_err());
        assert!(!dir.join("out/x").exists());

        std::fs::remove_dir_all(dir).unwrap();
    }
}
