import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import { TOKENS } from '../../../../di/tokens'
import type { MessageRow, ReactionCount, Sticker } from '../../../../types'
import type IMessageRepository from '../interfaces/message-repository'
import type { ReactionRow } from '../interfaces/message-repository'

@injectable()
export default class MessageRepository implements IMessageRepository {
  constructor(@inject(TOKENS.Database) private db: Database) {}

  insert(message: Omit<MessageRow, 'id' | 'reactions'>) {
    const result = this.db
      .query(
        `INSERT INTO messages (account_id, msg_id, thread_id, thread_type, from_id, from_name, is_self, ts, msg_type, text, raw, recalled)
         VALUES ($account_id, $msg_id, $thread_id, $thread_type, $from_id, $from_name, $is_self, $ts, $msg_type, $text, $raw, $recalled)
         ON CONFLICT (account_id, msg_id) DO NOTHING`,
      )
      .run(message)
    return result.changes > 0 ? Number(result.lastInsertRowid) : undefined
  }

  index(id: number, body: string) {
    this.db.query('INSERT INTO messages_fts (rowid, body) VALUES (?, ?)').run(id, body)
  }

  // Cursor (ts, msg_id): nhiều ảnh gửi cùng lúc trùng ts.
  // Hai câu riêng thay vì `$before IS NULL OR ...`: dạng OR làm SQLite không seek theo ts, trang sâu phải quét từ đầu
  list(accountId: string, threadId: string, before: string | undefined, limit: number) {
    const cursorFilter = before === undefined ? '' : 'AND (ts, msg_id) < (SELECT ts, msg_id FROM messages WHERE account_id = $accountId AND msg_id = $before)'
    return this.db
      .query(`SELECT * FROM messages WHERE account_id = $accountId AND thread_id = $threadId ${cursorFilter} ORDER BY ts DESC, msg_id DESC LIMIT $limit`)
      .all({ accountId, threadId, before: before ?? null, limit }) as MessageRow[]
  }

  get(accountId: string, msgId: string) {
    return (this.db.query('SELECT * FROM messages WHERE account_id = ? AND msg_id = ?').get(accountId, msgId) as MessageRow | null) ?? undefined
  }

  // Trigger messages_fts_recall gỡ tin khỏi index tìm kiếm
  recall(accountId: string, msgId: string) {
    return this.db.query('UPDATE messages SET recalled = 1 WHERE account_id = ? AND msg_id = ? AND recalled = 0').run(accountId, msgId).changes > 0
  }

  search(match: string, accountId: string | undefined, limit: number) {
    return this.db
      .query(
        `SELECT m.* FROM messages_fts f JOIN messages m ON m.id = f.rowid
         WHERE messages_fts MATCH $match AND ($accountId IS NULL OR m.account_id = $accountId)
         ORDER BY m.ts DESC, m.msg_id DESC LIMIT $limit`,
      )
      .all({ match, accountId: accountId ?? null, limit }) as MessageRow[]
  }

  react(reaction: ReactionRow) {
    return (
      this.db
        .query('INSERT INTO reactions (account_id, msg_id, id, user_id, icon, ts) VALUES ($account_id, $msg_id, $id, $user_id, $icon, $ts) ON CONFLICT DO NOTHING')
        .run(reaction).changes > 0
    )
  }

  // Lần thả cũ hơn lần gỡ gần nhất của chính người đó thì không tính, bất kể cái nào về trước
  reactions(accountId: string, msgIds: string[]) {
    const rows = this.db
      .query(
        `SELECT r.msg_id, r.icon, count(*) AS count, max(r.user_id = r.account_id) AS mine
         FROM reactions r
         WHERE r.account_id = $accountId AND r.msg_id IN (SELECT value FROM json_each($msgIds)) AND r.icon <> ''
           AND r.ts > (SELECT coalesce(max(g.ts), 0) FROM reactions g
                       WHERE g.account_id = r.account_id AND g.msg_id = r.msg_id AND g.user_id = r.user_id AND g.icon = '')
         GROUP BY r.msg_id, r.icon ORDER BY count DESC, min(r.ts)`,
      )
      .all({ accountId, msgIds: JSON.stringify(msgIds) }) as { msg_id: string; icon: string; count: number; mine: number }[]
    const reactionsByMsg = new Map<string, ReactionCount[]>()
    for (const { msg_id, icon, count, mine } of rows) reactionsByMsg.set(msg_id, [...(reactionsByMsg.get(msg_id) ?? []), { icon, count, mine: mine === 1 }])
    return reactionsByMsg
  }

  recentStickers(limit: number) {
    return this.db
      .query(
        `SELECT json_extract(raw, '$.content.id') AS id, json_extract(raw, '$.content.catId') AS cateId, json_extract(raw, '$.content.type') AS type
         FROM messages WHERE msg_type = 'chat.sticker' AND is_self = 1
         GROUP BY json_extract(raw, '$.content.id') ORDER BY MAX(ts) DESC LIMIT ?`,
      )
      .all(limit) as Sticker[]
  }

  cursor(accountId: string, key: string) {
    return (this.db.query('SELECT value FROM sync_state WHERE account_id = ? AND key = ?').get(accountId, key) as { value: string } | null)?.value
  }

  setCursor(accountId: string, key: string, msgId: string) {
    this.db
      .query(
        `INSERT INTO sync_state (account_id, key, value, synced_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (account_id, key) DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`,
      )
      .run(accountId, key, msgId, Date.now())
  }
}
