import type { Presence, ThreadRow } from '../../../../types'
import type { FindByPhoneRequest } from '../../dtos/requests/thread.request'

export default interface IThreadService {
  // Hội thoại đã có tin, mới nhất trước; bỏ accountId = gộp mọi acc
  list(accountId?: string): ThreadRow[]
  // Bạn bè + nhóm đang tham gia (kể cả chưa nhắn), đồng bộ mỗi lần acc đăng nhập → WS 'threads'
  contacts(accountId: string): ThreadRow[]
  // Người lạ chưa nhắn cũng có (vd vừa tìm theo số); không thấy thì NotFound
  get(accountId: string, id: string): ThreadRow
  // Hỏi Zalo theo số (Zalo giới hạn số lượt mỗi ngày), lưu người tìm được vào danh bạ của nick để mở chat được
  findByPhone(query: FindByPhoneRequest): Promise<ThreadRow>
  markRead(accountId: string, id: string): void
  // Hỏi Zalo mỗi lần gọi (client tự hỏi lại mỗi phút), cần nick online; áp dụng cả người lạ
  presence(accountId: string, userId: string): Promise<Presence>
}
