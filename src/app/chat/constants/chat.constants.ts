import type { Reactions } from "@/shared/types"
import { MessageType } from "@/app/chat/enums/chat.enums"

export const PAGE_SIZE = 50
export const TIMESTAMP_GAP_MS = 5 * 60_000


export const REACTION_EMOJI: Record<string, string> = {
  "/-heart": "❤️",
  "/-strong": "👍",
  ":>": "😆",
  ":o": "😮",
  ":-((": "😢",
  ":-h": "😡",
} satisfies Partial<Record<`${Reactions}`, string>>
export const MESSAGE_LABELS: Record<string, string> = {
  [MessageType.Sticker]: "[Sticker]",
  [MessageType.Photo]: "[Hình ảnh]",
  [MessageType.Gif]: "[GIF]",
  [MessageType.File]: "[Tệp]",
  [MessageType.Video]: "[Video]",
  [MessageType.Location]: "[Vị trí]",
  [MessageType.Voice]: "[Tin nhắn thoại]",
}
export const MEDIA_MESSAGE_TYPES = new Set<string>([MessageType.Sticker, MessageType.Photo, MessageType.Gif])
