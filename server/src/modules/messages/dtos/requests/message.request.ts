import { Reactions } from 'zca-js'
import { z } from 'zod'
import { Sticker } from '../responses/message.response'

const limit = z.coerce.number().int().min(1).max(200).default(50)

export const SearchMessagesRequest = z.object({ q: z.string(), accountId: z.string().optional(), limit })
export type SearchMessagesRequest = z.infer<typeof SearchMessagesRequest>

export const SearchStickersRequest = z.object({ accountId: z.string(), q: z.string().trim().min(1) })
export type SearchStickersRequest = z.infer<typeof SearchStickersRequest>

export const ListMessagesRequest = z.object({ before: z.string().optional(), limit })
export type ListMessagesRequest = z.infer<typeof ListMessagesRequest>

export const SendMessageRequest = z.object({ text: z.string().trim().min(1), quoteMsgId: z.string().optional() })
export type SendMessageRequest = z.infer<typeof SendMessageRequest>

// dims[i] = "RộngxCao" của file[i] nếu là ảnh (client đo), "" nếu không
export const SendAttachmentsRequest = z
  .object({
    'file[]': z.array(z.instanceof(File).meta({ type: 'string', format: 'binary' })).min(1),
    'dims[]': z.array(z.string().regex(/^(\d+x\d+)?$/)),
    text: z.string().trim().default(''),
    quoteMsgId: z.string().optional(),
  })
  .refine((b) => b['file[]'].length === b['dims[]'].length, 'each file needs a dims entry')
export type SendAttachmentsRequest = z.infer<typeof SendAttachmentsRequest>

export const SendStickerRequest = Sticker
export type SendStickerRequest = z.infer<typeof SendStickerRequest>

export const ReactRequest = z.object({ icon: z.enum(Reactions) })
export type ReactRequest = z.infer<typeof ReactRequest>
