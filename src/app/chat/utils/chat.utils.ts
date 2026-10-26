import type { InfiniteData } from "@tanstack/react-query"
import type { MessageRow } from "@/shared/types"
import type { ChatMessage } from "@/app/chat/models/message.model"
import { MESSAGE_LABELS } from "@/app/chat/constants/chat.constants"

// Mới nhất trước, giống thứ tự server trả
export const flattenMessages = (d: InfiniteData<MessageRow[]>): ChatMessage[] =>
  d.pages.flat().map((m) => {
    const { content, quote } = JSON.parse(m.raw)
    return { ...m, content, quote }
  })

export const toDateKey = (ts: number) => new Date(ts).toDateString()
export const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
export const formatDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60} giây` : `${s} giây`)
const relativeTime = new Intl.RelativeTimeFormat("vi", { numeric: "auto" })
// "5 phút trước", "2 giờ trước", "hôm qua"...
export function formatRelative(ts: number) {
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60_000))
  if (minutes < 60) return relativeTime.format(-minutes, "minute")
  if (minutes < 1440) return relativeTime.format(-Math.round(minutes / 60), "hour")
  return relativeTime.format(-Math.round(minutes / 1440), "day").toLowerCase() // "Hôm qua" → ghép giữa câu
}
export const formatDateTime = (ts: number) => new Date(ts).toLocaleString("vi-VN")
export const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })
export const getStickerUrl = (id?: number | string) => `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${id}&size=130`

// "RộngxCao" cho ảnh (server cần để gửi dạng ảnh), "" cho tệp khác hoặc ảnh không đọc được
export async function getImageDims(f: File) {
  if (!f.type.startsWith("image/")) return ""
  const bmp = await createImageBitmap(f).catch(() => null)
  if (!bmp) return ""
  const dims = `${bmp.width}x${bmp.height}`
  bmp.close()
  return dims
}

// Cuộn tới tin (nếu đã hiện trong danh sách) và nháy cho dễ thấy; false nếu tin chưa được tải
export function scrollToMessage(msgId: string) {
  const el = document.getElementById(`msg-${msgId}`)
  if (!el) return false
  el.scrollIntoView({ block: "center", behavior: "smooth" })
  el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 400, iterations: 2 })
  return true
}

// Một dòng tóm tắt tin, cho thanh "Trả lời ..." ở ô nhập
export const getMessagePreview = (m: ChatMessage) => {
  const content = typeof m.content === "object" ? m.content : {}
  return m.text ?? (content.title || MESSAGE_LABELS[m.msg_type] || "[Tin nhắn]")
}
