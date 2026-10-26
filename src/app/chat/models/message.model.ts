import type { MessageRow } from "@/shared/types"

export type MessageContent = { title?: string; description?: string; href?: string; thumb?: string; id?: number | string; action?: string; params?: string }
export type ChatMessage = MessageRow & { content?: string | MessageContent; quote?: { msg: string } }
