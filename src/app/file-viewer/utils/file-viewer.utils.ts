import type { FileExtension, FileType, ViewerFile, ZipEntry, ZipRow } from "@/app/file-viewer/models/file-viewer.model"
import { FILE_TYPES } from "@/app/file-viewer/constants/file-viewer.constants"

const UNITS = ["B", "KB", "MB", "GB"]

export const fileType = (ext: string): FileType => FILE_TYPES[ext.toLowerCase() as FileExtension] ?? "unknown"
export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "")
export const fileKey = (f: ViewerFile) => ["file", f.path ?? f.url]

export function formatSize(bytes: number) {
  let i = 0
  while (bytes >= 1024 && i < UNITS.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toLocaleString("vi-VN", { maximumFractionDigits: i ? 1 : 0 })} ${UNITS[i]}`
}

export function fromUrl(url: string): ViewerFile {
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "") || "anh.jpg"
  return { name, ext: extOf(name) || "jpg", url }
}

export function zipTree(entries: ZipEntry[]): ZipRow[] {
  const all = new Map<string, ZipEntry>()
  for (const e of entries) {
    const parts = e.name.split("/").filter(Boolean)
    for (let i = 1; i < parts.length; i++) {
      const dir = `${parts.slice(0, i).join("/")}/`
      if (!all.has(dir)) all.set(dir, { name: dir, size: 0, dir: true })
    }
    all.set(e.name, e)
  }
  return [...all.values()]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((e) => {
      const parts = e.name.split("/").filter(Boolean)
      return { ...e, depth: parts.length - 1, label: parts.at(-1) ?? e.name }
    })
}
