import { type ComponentType, lazy, type ReactNode, Suspense, useEffect, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Download, ExternalLink } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty"
import { FILE_ICONS, TEXT_LIMIT } from "@/app/file-viewer/constants/file-viewer.constants"
import { useLocalFile } from "@/app/file-viewer/hooks/useLocalFile"
import type { FileType, ViewerFile, ViewProps } from "@/app/file-viewer/models/file-viewer.model"
import { fail, openExternal, saveAs } from "@/app/file-viewer/services/file-viewer.service"
import { fileType } from "@/app/file-viewer/utils/file-viewer.utils"

const PdfView = lazy(() => import("@/app/file-viewer/components/pdf-view").then((m) => ({ default: m.PdfView })))
const DocxView = lazy(() => import("@/app/file-viewer/components/docx-view").then((m) => ({ default: m.DocxView })))
const SheetView = lazy(() => import("@/app/file-viewer/components/sheet-view").then((m) => ({ default: m.SheetView })))

function TextView({ src, onError }: ViewProps) {
  const [text, setText] = useState<string>()
  const [cut, setCut] = useState(false)

  useEffect(() => {
    let live = true
    fetch(src, { headers: { Range: `bytes=0-${TEXT_LIMIT - 1}` } })
      .then(async (r) => {
        const b = await r.arrayBuffer()
        if (!live) return
        // protocol asset trả tối đa 1000 KB mỗi range; tổng thật nằm sau "/" trong Content-Range
        setText(new TextDecoder().decode(b))
        setCut(Number(r.headers.get("content-range")?.split("/")[1]) > b.byteLength)
      })
      .catch(onError)
    return () => {
      live = false
    }
  }, [src])

  if (text === undefined) return null
  return (
    <pre className="min-h-full w-full self-start bg-background p-4 font-mono text-xs whitespace-pre-wrap">
      {text}
      {cut && <p className="mt-4 text-muted-foreground">Chỉ hiện phần đầu file. Mở bằng ứng dụng khác để xem hết.</p>}
    </pre>
  )
}

const VIEWS: Partial<Record<FileType, ComponentType<ViewProps>>> = {
  pdf: PdfView,
  docx: DocxView,
  xlsx: SheetView,
  csv: SheetView,
  txt: TextView,
  code: TextView,
}

function State({ file, title, description, children }: { file?: ViewerFile; title: string; description?: string; children?: ReactNode }) {
  const Icon = file && FILE_ICONS[fileType(file.ext)]
  return (
    <Empty>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription className="break-all">{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent className="flex-row justify-center">{children}</EmptyContent>}
    </Empty>
  )
}

function OpenExternal({ file }: { file: ViewerFile }) {
  return (
    <Button variant="outline" onClick={() => openExternal(file).catch(fail)}>
      <ExternalLink /> Mở bằng ứng dụng khác
    </Button>
  )
}

export function FileContent({ file, zoom, onPage }: Pick<ViewProps, "file" | "zoom" | "onPage">) {
  const type = fileType(file.ext)
  const View = VIEWS[type]
  const local = useLocalFile(file, !!View)
  const [broken, setBroken] = useState(false)
  const onError = (e: unknown) => {
    console.warn(e)
    setBroken(true)
  }

  if (broken)
    return (
      <State file={file} title="Không hiển thị được file này">
        <OpenExternal file={file} />
      </State>
    )

  if (type === "image" || type === "video" || type === "audio") {
    const src = file.path ? convertFileSrc(file.path) : file.url!
    // zoom không nhân % nên giới hạn max cũng phải nhân theo, không thì ảnh to bị kẹp ở khung
    const max = `${zoom * 100}%`
    if (type === "image") return <img src={src} alt={file.name} style={{ zoom, maxWidth: max, maxHeight: max }} onError={onError} className="m-auto object-contain" />
    if (type === "video") return <video src={src} controls autoPlay onError={onError} className="m-auto max-h-full max-w-full" />
    return <audio src={src} controls autoPlay onError={onError} className="m-auto" />
  }

  if (!View)
    return (
      <State file={file} title={file.name} description="Không xem trước được loại file này">
        <OpenExternal file={file} />
        <Button onClick={() => saveAs(file).catch(fail)}>
          <Download /> Lưu về máy
        </Button>
      </State>
    )

  if (local.error)
    return (
      <State file={file} title="Không tải được file" description={String(local.error)}>
        <Button variant="outline" onClick={() => local.refetch()}>
          Thử lại
        </Button>
        {file.url && <Button onClick={() => openUrl(file.url!)}>Mở trong trình duyệt</Button>}
      </State>
    )

  if (!local.data) return <State file={file} title={`Đang tải… ${local.progress}%`} />

  return (
    <Suspense fallback={<State file={file} title="Đang mở…" />}>
      <View src={convertFileSrc(local.data)} file={file} zoom={zoom} onPage={onPage} onError={onError} />
    </Suspense>
  )
}
