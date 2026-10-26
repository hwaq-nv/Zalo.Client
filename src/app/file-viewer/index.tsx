import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Toaster } from "@/shared/components/ui/sonner"
import { FileViewer } from "@/app/file-viewer/components/viewer/file-viewer"
import type { ViewerFile } from "@/app/file-viewer/models/file-viewer.model"
import { getFileQueryKey } from "@/app/file-viewer/utils/file-viewer.utils"

export const FileViewerWindow = () => {
  const [file, setFile] = useState<ViewerFile | null>(null)

  // listen trước rồi mới hỏi Rust, để không lỡ file bấm trong lúc cửa sổ đang mở
  useEffect(() => {
    const off = listen<ViewerFile>("viewer:open", (e) => setFile(e.payload))
    off.then(() => invoke<ViewerFile | null>("viewer_file")).then((f) => f && setFile(f))
    return () => void off.then((f) => f())
  }, [])

  return (
    <>
      {file && <FileViewer key={getFileQueryKey(file).join()} file={file} />}
      <Toaster />
    </>
  )
}
