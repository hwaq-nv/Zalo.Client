import { useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/shared/utils/shadcn"

export const MessageText = ({ text }: { text: string }) => {
  const ref = useRef<HTMLParagraphElement>(null)
  const [clamped, setClamped] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useLayoutEffect(() => setClamped(ref.current!.scrollHeight > ref.current!.clientHeight), [text])
  return (
    <>
      <p ref={ref} className={cn("wrap-break-word whitespace-pre-wrap", !expanded && "line-clamp-10")}>
        {text}
      </p>
      {clamped && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-xs font-medium opacity-80 hover:underline">
          {expanded ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </>
  )
}
