import { API, DeliveredMessage, FriendEvent, GroupEvent, Message, Reaction, SeenMessage, ThreadType, Typing, Undo } from "zca-js"
import { AccountStatus } from "../../types"

export type ZaloEvents = {
  status: [accountId: string, status: AccountStatus]
  message: [accountId: string, message: Message]
  old_messages: [accountId: string, messages: Message[], type: ThreadType]
  undo: [accountId: string, undo: Undo]
  reaction: [accountId: string, reaction: Reaction]
  seen_messages: [accountId: string, seens: SeenMessage[]]
  delivered_messages: [accountId: string, delivereds: DeliveredMessage[]]
  typing: [accountId: string, typing: Typing]
  old_reactions: [accountId: string, reactions: Reaction[], isGroup: boolean]
  friend_event: [accountId: string, event: FriendEvent]
  group_event: [accountId: string, event: GroupEvent]
  attached: [accountId: string, api: API]
  voip: [accountId: string, control: VoipControl]
}

export type VoipControl = { act_type: 'voip'; act: string; data: unknown }
export type VoicecallProps = { path: string; params: Record<string, unknown> }
export type VoicecallApi = API & { voicecall(props: VoicecallProps): Promise<unknown> }
