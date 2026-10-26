import type { InfiniteData } from "@tanstack/react-query"
import type { MessageRow } from "@/shared/types"
import type { ChatMessage } from "@/app/chat/models/message.model"

// Mới nhất trước, giống thứ tự server trả
export const flattenMessages = (d: InfiniteData<MessageRow[]>): ChatMessage[] =>
  d.pages.flat().map((m) => {
    const { content, quote } = JSON.parse(m.raw)
    return { ...m, content, quote }
  })

export const toDateKey = (ts: number) => new Date(ts).toDateString()
export const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
export const formatDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60} giây` : `${s} giây`)
export const formatDateTime = (ts: number) => new Date(ts).toLocaleString("vi-VN")
export const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })
export const getStickerUrl = (id?: number | string) => `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${id}&size=130`
