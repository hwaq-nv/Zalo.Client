import { z } from 'zod'

export const ListThreadsRequest = z.object({ accountId: z.string().optional() })
export type ListThreadsRequest = z.infer<typeof ListThreadsRequest>

export const FindByPhoneRequest = z.object({ accountId: z.string(), phone: z.string().trim().min(1) })
export type FindByPhoneRequest = z.infer<typeof FindByPhoneRequest>

export const ListThreadContactsRequest = z.object({ accountId: z.string() })
export type ListThreadContactsRequest = z.infer<typeof ListThreadContactsRequest>
