import { z } from 'zod'

const Member = z.object({ id: z.string(), name: z.string().default(''), avatar: z.string().default('') })

export const StartCallRequest = z.object({ threadId: z.string(), video: z.boolean().default(false), members: z.array(Member).default([]) })
export type StartCallRequest = z.infer<typeof StartCallRequest>

export const CallAction = z.object({
  accountId: z.string(),
  action: z.enum(['accept', 'reject', 'hangup', 'mute', 'speaker', 'camera', 'tile', 'needkey', 'device']),
  on: z.boolean().default(false),
  src: z.string().optional(),
  width: z.number().default(0),
})
export type CallAction = z.infer<typeof CallAction>
