import { MessageType } from "@/app/chat/enums/chat.enums"

export const PAGE_SIZE = 50
export const TIMESTAMP_GAP_MS = 5 * 60_000

export const REACTION_EMOJI: Record<string, string> = { "/-heart": "❤️", "/-strong": "👍", ":>": "😆", ":o": "😮", ":-((": "😢", ":-h": "😡" }
export const MESSAGE_LABELS: Record<string, string> = {
  [MessageType.Video]: "[Video]",
  [MessageType.Location]: "[Vị trí]",
  [MessageType.Voice]: "[Tin nhắn thoại]",
}
export const BARE_MESSAGE_TYPES = new Set<string>([MessageType.Sticker, MessageType.Photo, MessageType.Gif])
