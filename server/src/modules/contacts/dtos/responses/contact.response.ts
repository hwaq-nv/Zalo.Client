import { z } from 'zod'
import { AccountState } from '../../../accounts/dtos/responses/account.response'

export const Relation = z.enum(['none', 'friend', 'sent', 'received', 'blocked'])
export type Relation = z.infer<typeof Relation>

// Một người thật, dù nói chuyện qua bao nhiêu nick
export const Contact = z.object({
  id: z.number(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  zalo_uid: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.number(),
})
export type Contact = z.infer<typeof Contact>

export const ContactLink = z.object({
  account_id: z.string(),
  account_name: z.string(),
  account_state: AccountState,
  user_id: z.string(),
  relation: Relation,
  name: z.string().nullable(),
  avatar: z.string().nullable(),
})
export type ContactLink = z.infer<typeof ContactLink>

export const ContactDetail = Contact.extend({ links: z.array(ContactLink) })
export type ContactDetail = z.infer<typeof ContactDetail>

// live = số nick đang dùng là bạn với người này; reach = số nick đang dùng còn liên lạc được (bạn hoặc đang nhắn)
export const AtRiskContact = z.object({
  id: z.number(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  avatar: z.string().nullable(),
  live: z.number(),
  reach: z.number(),
})
export type AtRiskContact = z.infer<typeof AtRiskContact>
