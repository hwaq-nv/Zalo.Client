import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ViewerFile } from "@/app/file-viewer/models/file-viewer.model"
import { download } from "@/app/file-viewer/services/file-viewer.service"
import { fileKey } from "@/app/file-viewer/utils/file-viewer.utils"

export function useLocalFile(file: ViewerFile, enabled = true) {
  const [progress, setProgress] = useState(0)
  const query = useQuery({ queryKey: fileKey(file), queryFn: () => download(file, setProgress), enabled, retry: false })
  return { ...query, progress }
}
