import { type MouseEvent, useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Download, ExternalLink, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Toaster } from "@/shared/components/ui/sonner"
import { FileContent } from "@/app/file-viewer/components/file-content"
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/app/file-viewer/constants/file-viewer.constants"
import type { ViewerFile } from "@/app/file-viewer/models/file-viewer.model"
import { fail, openExternal, saveAs } from "@/app/file-viewer/services/file-viewer.service"
import { fileKey, fileType, formatSize } from "@/app/file-viewer/utils/file-viewer.utils"

const ZOOMABLE = new Set(["image", "pdf", "docx"])

// Link trong pdf/docx mà để webview tự mở thì cửa sổ viewer bị điều hướng mất
function openLink(e: MouseEvent) {
  const href = (e.target as HTMLElement).closest("a")?.getAttribute("href")
  if (!href || !/^https?:/.test(href)) return
  e.preventDefault()
  openUrl(href)
}

function Viewer({ file }: { file: ViewerFile }) {
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState<[number, number]>()

  return (
    <div className="flex h-screen flex-col bg-background text-sm text-foreground">
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <span className="truncate font-medium">{file.name}</span>
        {file.size != null && <span className="shrink-0 px-1 text-muted-foreground">{formatSize(file.size)}</span>}
        <span className="flex-1" />
        {ZOOMABLE.has(fileType(file.ext)) && (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Thu nhỏ" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}>
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Phóng to" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}>
              <ZoomIn />
            </Button>
          </>
        )}
        {page && (
          <span className="shrink-0 px-2 text-muted-foreground">
            Trang {page[0]} / {page[1]}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => openExternal(file).catch(fail)}>
          <ExternalLink /> Mở bằng ứng dụng khác
        </Button>
        <Button size="sm" onClick={() => saveAs(file).catch(fail)}>
          <Download /> Lưu về máy
        </Button>
      </header>
      <main onClick={openLink} className="relative flex min-h-0 flex-1 overflow-auto bg-muted">
        <FileContent file={file} zoom={zoom} onPage={(c, t) => setPage([c, t])} />
      </main>
    </div>
  )
}

export function FileViewerWindow() {
  const [file, setFile] = useState<ViewerFile | null>(null)

  // listen trước rồi mới hỏi Rust, để không lỡ file bấm trong lúc cửa sổ đang mở
  useEffect(() => {
    const off = listen<ViewerFile>("viewer:open", (e) => setFile(e.payload))
    off.then(() => invoke<ViewerFile | null>("viewer_file")).then((f) => f && setFile(f))
    return () => void off.then((f) => f())
  }, [])

  return (
    <>
      {file && <Viewer key={fileKey(file).join()} file={file} />}
      <Toaster />
    </>
  )
}
