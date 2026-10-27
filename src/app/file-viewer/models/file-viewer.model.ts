import type { FILE_TYPES } from "@/app/file-viewer/constants/file-viewer.constants"

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

export type FileExtension = keyof typeof FILE_TYPES

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
