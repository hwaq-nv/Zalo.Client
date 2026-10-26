import { z } from 'zod'

const text = z.string().trim().transform((s) => s || null).nullable().optional()

export const ContactIdRequest = z.object({ id: z.coerce.number().int() })
export type ContactIdRequest = z.infer<typeof ContactIdRequest>

// minLinks=1: không còn nick nào là bạn, cần kết bạn lại; minLinks=2: chỉ còn một nick, nên có nick dự phòng
export const AtRiskContactsRequest = z.object({ minLinks: z.coerce.number().int().min(1).max(10).default(2) })
export type AtRiskContactsRequest = z.infer<typeof AtRiskContactsRequest>

export const UpdateContactRequest = z.object({ name: text, phone: text, note: text }).strict()
export type UpdateContactRequest = z.infer<typeof UpdateContactRequest>
