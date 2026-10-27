import type { ThreadType } from '@hwqnq/zca-js'
import type { ThreadRow } from '../../../../types'

export type ThreadActivity = {
  accountId: string
  id: string
  msgId: string
  ts: number
  // Tin của mình (trả lời = đã đọc), hoặc tin cũ kéo về lần đầu: dời mốc đã đọc thay vì cộng unread
  read: boolean
}

export default interface IThreadRepository {
  list(accountId?: string): ThreadRow[]
  // Bạn bè và nhóm đang tham gia của một nick, kể cả chưa nhắn
  contacts(accountId: string): ThreadRow[]
  // Một người hoặc nhóm bất kỳ nick này biết (kể cả người lạ chưa nhắn), không có preview
  get(accountId: string, id: string): ThreadRow | undefined
  // Thread có sẵn, hoặc suy ra từ danh bạ: 0 nếu là người, 1 nếu là nhóm
  typeOf(accountId: string, id: string): ThreadType | undefined
  // Tên (cùng thứ tự ưu tiên như list) và avatar của một người hoặc nhóm
  profile(accountId: string, id: string): { name: string | null; avatar: string | null } | undefined
  memberIds(accountId: string, groupId: string): string[]
  ensure(accountId: string, id: string, type: ThreadType): void
  // Gọi sau khi chèn được tin mới: dời con trỏ tin cuối theo (ts, msgId), cộng unread hoặc dời mốc đã đọc
  advance(activity: ThreadActivity): void
  markRead(accountId: string, id: string): boolean
}
