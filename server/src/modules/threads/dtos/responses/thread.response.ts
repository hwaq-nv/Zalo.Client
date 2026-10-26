import { z } from 'zod'

export const ThreadRow = z.object({
  account_id: z.string(),
  account_name: z.string(),
  id: z.string(),
  type: z.literal([0, 1]),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
  last_msg_at: z.number().nullable(),
  preview: z.string().nullable(),
  unread: z.number(),
  contact_id: z.number().nullable(),
})
export type ThreadRow = z.infer<typeof ThreadRow>

// Hội thoại riêng: online = truy cập trong vòng vài phút (suy từ lastOnline, ms).
// Người kia tắt hiện trạng thái hoạt động thì cả hai null
export const Presence = z.object({ online: z.boolean().nullable(), lastOnline: z.number().nullable() })
export type Presence = z.infer<typeof Presence>
