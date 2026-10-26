import { Channel, invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { openPath } from "@tauri-apps/plugin-opener"
import { toast } from "sonner"
import { queryClient } from "@/core/http/query-client"
import type { ViewerFile, ZipEntry } from "@/app/file-viewer/models/file-viewer.model"
import { getFileQueryKey } from "@/app/file-viewer/utils/file-viewer.utils"

export const openViewer = (file: ViewerFile) => invoke("open_viewer", { file }).catch(showError)
export const listZipEntries = (path: string) => invoke<ZipEntry[]>("zip_entries", { path })
export const extractZipEntry = (path: string, name: string) => invoke<string>("zip_extract", { path, name })

export function downloadFile(file: ViewerFile, onProgress?: (p: number) => void) {
  if (file.path) return Promise.resolve(file.path)
  const progress = new Channel<number>()
  if (onProgress) progress.onmessage = onProgress
  return invoke<string>("download_file", { url: file.url, name: file.name, progress })
}

// Dùng chung query với useLocalFile: đang tải thì chờ lượt tải đó, không tải lại
export const getLocalPath = (file: ViewerFile) => queryClient.fetchQuery({ queryKey: getFileQueryKey(file), queryFn: () => downloadFile(file) })

export async function saveAs(file: ViewerFile) {
  const dest = await save({ defaultPath: file.name })
  if (dest) await invoke("save_file", { src: await getLocalPath(file), dest })
}

export const openExternal = async (file: ViewerFile) => openPath(await getLocalPath(file))

export function showError(e: unknown) {
  toast.error("Có lỗi xảy ra", { description: String(e) })
}
