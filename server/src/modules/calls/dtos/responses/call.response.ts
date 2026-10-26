import { z } from 'zod'

export const GroupCallMember = z.object({ id: z.string(), name: z.string(), avatar: z.string() })
export const GroupCallMembers = z.object({ maxUsers: z.number(), members: z.array(GroupCallMember) })
export type GroupCallMembers = z.infer<typeof GroupCallMembers>

export type CallMember = { src: string; name: string; avatar: string; muted: boolean; camOff: boolean; state: string }

export type CallState = {
  phase: 'outgoing' | 'incoming' | 'connecting' | 'connected'
  name: string
  avatar: string
  text: string
  since: number
  video: boolean
  group: boolean
  noAnswer: boolean
  muted: boolean
  speakerOff: boolean
  camera: boolean
  peerCamOff: boolean
  peerMuted: boolean
  notice: string
  members: CallMember[]
}

export type CallMessage =
  | { type: 'state'; accountId: string; state: CallState }
  | { type: 'close'; accountId: string; text: string }
  | { type: 'speaking'; accountId: string; src: string; on: boolean }
export type CallVideo = { accountId: string; src: string; key: boolean }
