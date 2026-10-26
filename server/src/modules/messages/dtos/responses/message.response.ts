import { z } from 'zod'

// Cảm xúc trên một tin gộp theo icon (mã Zalo như '/-heart'); mine = nick đang xem đã thả
export const ReactionCount = z.object({ icon: z.string(), count: z.number(), mine: z.boolean() })
export type ReactionCount = z.infer<typeof ReactionCount>

export const MessageRow = z.object({
  id: z.number(),
  account_id: z.string(),
  msg_id: z.string(),
  thread_id: z.string(),
  thread_type: z.literal([0, 1]),
  from_id: z.string(),
  from_name: z.string().nullable(),
  is_self: z.literal([0, 1]),
  ts: z.number(),
  msg_type: z.string(),
  text: z.string().nullable(),
  raw: z.string(),
  recalled: z.literal([0, 1]),
  reactions: z.array(ReactionCount).optional(), // chỉ có khi đọc danh sách tin
})
export type MessageRow = z.infer<typeof MessageRow>

// Ảnh: https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid={id}&size=130 (công khai, không cần đăng nhập)
export const Sticker = z.object({ id: z.number().int(), cateId: z.number().int(), type: z.number().int() })
export type Sticker = z.infer<typeof Sticker>
