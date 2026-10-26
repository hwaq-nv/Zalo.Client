import type { AccountStatus } from './modules/accounts/dtos/responses/account.response'
import type { MessageRow, ReactionCount } from './modules/messages/dtos/responses/message.response'

export type * from './core/http/api.response'
export type { Reactions } from 'zca-js'
export type * from './modules/accounts/dtos/responses/account.response'
export type * from './modules/calls/dtos/responses/call.response'
export type * from './modules/contacts/dtos/responses/contact.response'
export type * from './modules/messages/dtos/responses/message.response'
export type * from './modules/threads/dtos/responses/thread.response'

export type ServerEvent =
  | { type: 'qr'; image: string }
  | { type: 'qr-scanned'; name: string; avatar: string }
  | { type: 'qr-failed' }
  | { type: 'qr-done'; id: string }
  | { type: 'account'; id: string; status: AccountStatus }
  | { type: 'message'; message: MessageRow }
  | { type: 'undo'; accountId: string; msgId: string }
  | { type: 'reaction'; accountId: string; threadId: string; msgId: string; reactions: ReactionCount[] }
  | { type: 'threads'; accountId: string }
  | { type: 'receipt'; accountId: string; threadId: string }
  | { type: 'typing'; accountId: string; threadId: string; userId: string; name: string | null }
