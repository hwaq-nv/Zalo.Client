import type { GroupCallMembers, ThreadRow } from "@/shared/types"

export type EncodedFrame = { key: boolean; data: Uint8Array }

export type CallAction = "accept" | "reject" | "hangup" | "mute" | "speaker" | "camera" | "tile" | "needkey"

export type CallCommand = {
  action: CallAction
  on?: boolean
  src?: string
  width?: number
}

export type StartCallRequest = { thread: ThreadRow; video: boolean; members?: GroupCallMembers["members"] }
