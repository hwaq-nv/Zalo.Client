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
