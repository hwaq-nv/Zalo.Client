export type FileType =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "docx"
  | "doc"
  | "xlsx"
  | "csv"
  | "pptx"
  | "txt"
  | "code"
  | "rtf"
  | "archive"
  | "unknown"

export type FileExtension =
  | "pdf"
  | "png"
  | "jpg"
  | "jpeg"
  | "webp"
  | "gif"
  | "svg"
  | "mp4"
  | "webm"
  | "mp3"
  | "wav"
  | "doc"
  | "docx"
  | "xls"
  | "xlsx"
  | "csv"
  | "ppt"
  | "pptx"
  | "txt"
  | "json"
  | "xml"
  | "md"
  | "rtf"
  | "zip"
  | "rar"
  | "7z"

export type ViewerFile = { name: string; ext: string; size?: number; url?: string; path?: string }

export type ZipEntry = { name: string; size: number; dir: boolean }

export type ZipRow = ZipEntry & { depth: number; label: string }

export type ViewProps = {
  src: string
  file: ViewerFile
  zoom: number
  onPage: (current: number, total: number) => void
  onError: (e: unknown) => void
}
