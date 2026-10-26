import type { MessageRow, ReactionCount, Sticker } from '../../../../types'

export type ReactionRow = { account_id: string; msg_id: string; id: string; user_id: string; icon: string; ts: number }

export default interface IMessageRepository {
  // Trả id mới, hoặc undefined nếu tin đã có (Zalo gửi lại tin cũ khi nối lại)
  insert(message: Omit<MessageRow, 'id' | 'reactions'>): number | undefined
  // Đánh index tìm kiếm cho tin vừa chèn; body đã bỏ dấu
  index(id: number, body: string): void
  // Mới nhất trước; before = msg_id tin cũ nhất đã tải
  list(accountId: string, threadId: string, before: string | undefined, limit: number): MessageRow[]
  get(accountId: string, msgId: string): MessageRow | undefined
  recall(accountId: string, msgId: string): boolean
  // match là câu FTS5 đã dựng sẵn (buildFtsQuery); mới nhất trước
  search(match: string, accountId: string | undefined, limit: number): MessageRow[]
  // false nếu lần thả này đã có (Zalo gửi lại khi kéo bù)
  react(r: ReactionRow): boolean
  // Gộp theo icon, nhiều nhất trước; tin không có cảm xúc thì không có trong Map
  reactions(accountId: string, msgIds: string[]): Map<string, ReactionCount[]>
  // Sticker mình đã gửi (mọi nick), mới dùng nhất trước, không lặp
  recentStickers(limit: number): Sticker[]
  // Mốc kéo bù: mọi tin có msgId ≤ mốc đều đã nằm trong DB
  cursor(accountId: string, key: string): string | undefined
  setCursor(accountId: string, key: string, msgId: string): void
}
