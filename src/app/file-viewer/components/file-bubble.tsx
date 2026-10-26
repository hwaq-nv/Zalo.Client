import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Download, ExternalLink, Folder } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible"
import { FILE_ICONS } from "@/app/file-viewer/constants/file-viewer.constants"
import { useLocalFile } from "@/app/file-viewer/hooks/useLocalFile"
import type { ViewerFile, ZipRow } from "@/app/file-viewer/models/file-viewer.model"
import { fail, openExternal, openViewer, saveAs, zipEntries, zipExtract } from "@/app/file-viewer/services/file-viewer.service"
import { extOf, fileType, formatSize, zipTree } from "@/app/file-viewer/utils/file-viewer.utils"

function ZipList({ file }: { file: ViewerFile }) {
  const local = useLocalFile(file)
  const entries = useQuery({ queryKey: ["zip", local.data], queryFn: () => zipEntries(local.data!), enabled: !!local.data, retry: false })

  if (local.error || entries.error)
    return (
      <p className="mt-2 text-xs">
        Không đọc được file zip.{" "}
        <button type="button" className="underline" onClick={() => (local.error ? local.refetch() : entries.refetch())}>
          Thử lại
        </button>
      </p>
    )
  if (!entries.data) return <p className="mt-2 text-xs opacity-70">Đang tải… {local.progress}%</p>

  const open = (r: ZipRow) =>
    zipExtract(local.data!, r.name)
      .then((path) => openViewer({ name: r.label, ext: extOf(r.label), size: r.size, path }))
      .catch(fail)

  return (
    <div className="mt-2 border-t border-current/20 pt-2 text-xs">
      <div className="mb-1 flex items-center gap-1">
        <span className="opacity-70">{entries.data.filter((e) => !e.dir).length} file</span>
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={() => saveAs(file).catch(fail)}>
          <Download /> Lưu
        </Button>
        <Button variant="ghost" size="xs" onClick={() => openExternal(file).catch(fail)}>
          <ExternalLink /> Mở bằng ứng dụng khác
        </Button>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {zipTree(entries.data).map((r) => (
          <li key={r.name} style={{ paddingLeft: r.depth * 12 }}>
            {r.dir ? (
              <span className="flex items-center gap-1 py-0.5 opacity-70">
                <Folder className="size-3.5 shrink-0" /> {r.label}
              </span>
            ) : (
              <button type="button" onClick={() => open(r)} className="flex w-full items-center py-0.5 text-left hover:underline">
                <span className="truncate">{r.label}</span>
                <span className="ml-auto shrink-0 pl-3 opacity-70">{formatSize(r.size)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FileBubble({ file }: { file: ViewerFile }) {
  const Icon = FILE_ICONS[fileType(file.ext)]
  const head = (
    <span className="flex min-w-0 items-center gap-2 text-left">
      <Icon className="size-8 shrink-0 opacity-80" strokeWidth={1.5} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{file.name}</span>
        {file.size != null && <span className="text-xs opacity-70">{formatSize(file.size)}</span>}
      </span>
    </span>
  )

  if (file.ext !== "zip")
    return (
      <button type="button" onClick={() => openViewer(file)} className="flex min-w-0">
        {head}
      </button>
    )
  return (
    <Collapsible className="min-w-56">
      <CollapsibleTrigger className="group flex w-full items-center gap-2">
        {head}
        <ChevronDown className="ml-auto size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ZipList file={file} />
      </CollapsibleContent>
    </Collapsible>
  )
}
