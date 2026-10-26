import { Channel, invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { openPath } from "@tauri-apps/plugin-opener"
import { toast } from "sonner"
import { queryClient } from "@/core/http/query-client"
import type { ViewerFile, ZipEntry } from "@/app/file-viewer/models/file-viewer.model"
import { fileKey } from "@/app/file-viewer/utils/file-viewer.utils"

export const openViewer = (file: ViewerFile) => invoke("open_viewer", { file }).catch(fail)
export const zipEntries = (path: string) => invoke<ZipEntry[]>("zip_entries", { path })
export const zipExtract = (path: string, name: string) => invoke<string>("zip_extract", { path, name })

export function download(file: ViewerFile, onProgress?: (p: number) => void) {
  if (file.path) return Promise.resolve(file.path)
  const progress = new Channel<number>()
  if (onProgress) progress.onmessage = onProgress
  return invoke<string>("download_file", { url: file.url, name: file.name, progress })
}

// Dùng chung query với useLocalFile: đang tải thì chờ lượt tải đó, không tải lại
export const localPath = (file: ViewerFile) => queryClient.fetchQuery({ queryKey: fileKey(file), queryFn: () => download(file) })

export async function saveAs(file: ViewerFile) {
  const dest = await save({ defaultPath: file.name })
  if (dest) await invoke("save_file", { src: await localPath(file), dest })
}

export const openExternal = async (file: ViewerFile) => openPath(await localPath(file))

export function fail(e: unknown) {
  toast.error("Có lỗi xảy ra", { description: String(e) })
}
