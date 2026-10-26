import type { ReactNode } from "react"
import { Phone, PhoneMissed, Video } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { ChatMessage, MessageContent } from "@/app/chat/models/message.model"
import { MESSAGE_LABELS } from "@/app/chat/constants/chat.constants"
import { MessageType, RecommendedAction } from "@/app/chat/enums/chat.enums"
import { duration, stickerUrl } from "@/app/chat/utils/chat.utils"
import { CallType } from "@/app/call/enums/call.enums"
import { FileBubble } from "@/app/file-viewer/components/file-bubble"
import { openViewer } from "@/app/file-viewer/services/file-viewer.service"
import { extOf, fromUrl } from "@/app/file-viewer/utils/file-viewer.utils"

function Link({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return children
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        openUrl(href)
      }}
      className="underline-offset-2 hover:underline"
    >
      {children}
    </a>
  )
}

// isCaller tính theo người gửi bubble, không phải theo nick đang xem
function Call({ m, c }: { m: ChatMessage; c: MessageContent }) {
  const p = JSON.parse(c.params || "{}")
  const out = (m.is_self === 1) === (p.isCaller === 1)
  const missed = c.action === RecommendedAction.MissedCall
  const Icon = missed ? PhoneMissed : p.calltype === CallType.Video ? Video : Phone
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 shrink-0" />
      <span className="flex flex-col">
        <span>{missed && !out ? "Cuộc gọi nhỡ" : `Cuộc gọi ${p.calltype === CallType.Video ? "video" : "thoại"} ${out ? "đi" : "đến"}`}</span>
        <span className="text-xs opacity-70">{missed ? (out ? "Không trả lời" : "") : duration(p.duration ?? 0)}</span>
      </span>
    </span>
  )
}

export function MessageBody({ m }: { m: ChatMessage }) {
  if (m.recalled) return <i className="opacity-70">Tin nhắn đã được thu hồi</i>
  if (m.text !== null) return <p className="wrap-break-word whitespace-pre-wrap">{m.text}</p>
  const c = typeof m.content === "object" ? m.content : {}
  switch (m.msg_type) {
    case MessageType.Sticker:
      return <img src={stickerUrl(c.id)} alt="Sticker" className="size-32" />
    case MessageType.Photo:
    case MessageType.Gif:
      return (
        <button type="button" disabled={!c.href} onClick={() => openViewer(fromUrl(c.href!))} className="block">
          <img src={c.thumb || c.href} alt={c.title || "Hình ảnh"} className="max-h-72 rounded-xl" />
        </button>
      )
    case MessageType.Voice:
      return <audio controls src={c.href} className="max-w-64" />
    case MessageType.File: {
      const p = JSON.parse(c.params || "{}")
      const name = c.title || "Tệp"
      return <FileBubble file={{ name, ext: (p.fileExt || extOf(name)).toLowerCase(), size: Number(p.fileSize) || undefined, url: c.href }} />
    }
    case MessageType.Recommended:
      if (c.action === RecommendedAction.CallTime || c.action === RecommendedAction.MissedCall) return <Call m={m} c={c} />
      return <Link href={c.href}>{c.title || c.href}</Link>
    default:
      return <span className="opacity-70">{MESSAGE_LABELS[m.msg_type] ?? "[Tin nhắn]"}</span>
  }
}
