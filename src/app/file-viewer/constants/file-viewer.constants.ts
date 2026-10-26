import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, type LucideIcon } from "lucide-react"
import type { FileExtension, FileType } from "@/app/file-viewer/models/file-viewer.model"

export const FILE_TYPES: Record<FileExtension, FileType> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  mp4: "video",
  webm: "video",
  mp3: "audio",
  wav: "audio",
  doc: "doc",
  docx: "docx",
  xls: "xlsx",
  xlsx: "xlsx",
  csv: "csv",
  ppt: "pptx",
  pptx: "pptx",
  txt: "txt",
  md: "txt",
  json: "code",
  xml: "code",
  rtf: "rtf",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
}

export const FILE_ICONS: Record<FileType, LucideIcon> = {
  pdf: FileText,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  docx: FileText,
  doc: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  pptx: File,
  txt: FileText,
  code: FileCode,
  rtf: FileText,
  archive: FileArchive,
  unknown: File,
}

export const TEXT_LIMIT = 1024 * 1024
// ponytail: bảng chỉ đọc 1000 dòng đầu mỗi sheet; cần hơn thì dùng virtua
export const SHEET_ROWS = 1000
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4
export const ZOOM_STEP = 1.25
