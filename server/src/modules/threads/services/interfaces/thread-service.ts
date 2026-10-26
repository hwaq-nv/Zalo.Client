import type { ThreadRow } from '../../../../types'

export default interface IThreadService {
  // Hội thoại đã có tin, mới nhất trước; bỏ accountId = gộp mọi acc
  list(accountId?: string): ThreadRow[]
  // Bạn bè + nhóm đang tham gia (kể cả chưa nhắn), đồng bộ mỗi lần acc đăng nhập → WS 'threads'
  contacts(accountId: string): ThreadRow[]
  markRead(accountId: string, id: string): void
}
