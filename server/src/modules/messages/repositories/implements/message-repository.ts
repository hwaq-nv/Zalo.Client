import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import { TOKENS } from '../../../../di/tokens'
import type { MessageRow, ReactionCount, Receipt, Sticker } from '../../../../types'
import type IMessageRepository from '../interfaces/message-repository'
import type { ReactionRow } from '../interfaces/message-repository'

const COLUMNS = `m.id, m.account_id, CAST(m.msg_id AS TEXT) AS msg_id, CAST(m.cli_msg_id AS TEXT) AS cli_msg_id, CAST(m.quote_msg_id AS TEXT) AS quote_msg_id,
  m.thread_id, m.thread_type, m.from_id, m.from_name, m.is_self, m.ts, m.msg_type, m.text, m.raw, m.recalled`

@injectable()
export default class MessageRepository implements IMessageRepository {
  constructor(@inject(TOKENS.Database) private db: Database) {}

  insert(message: Omit<MessageRow, 'id' | 'reactions' | 'from_avatar'>) {
    const result = this.db
      .query(
        `INSERT INTO messages (account_id, msg_id, cli_msg_id, quote_msg_id, thread_id, thread_type, from_id, from_name, is_self, ts, msg_type, text, raw, recalled)
         VALUES ($account_id, $msg_id, $cli_msg_id, $quote_msg_id, $thread_id, $thread_type, $from_id, $from_name, $is_self, $ts, $msg_type, $text, $raw, $recalled)
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
    const cursorFilter = before === undefined ? '' : 'AND (m.ts, m.msg_id) < (SELECT ts, msg_id FROM messages WHERE account_id = $accountId AND msg_id = $before)'
    return this.db
      .query(
        `SELECT ${COLUMNS}, u.avatar AS from_avatar FROM messages m
         LEFT JOIN users u ON u.account_id = m.account_id AND u.id = m.from_id
         WHERE m.account_id = $accountId AND m.thread_id = $threadId ${cursorFilter} ORDER BY m.ts DESC, m.msg_id DESC LIMIT $limit`,
      )
      .all({ accountId, threadId, before: before ?? null, limit }) as MessageRow[]
  }

  get(accountId: string, msgId: string) {
    return (this.db.query(`SELECT ${COLUMNS} FROM messages m WHERE m.account_id = ? AND m.msg_id = ?`).get(accountId, msgId) as MessageRow | null) ?? undefined
  }

  // Trigger messages_fts_recall gỡ tin khỏi index tìm kiếm
  recall(accountId: string, msgId: string) {
    return this.db.query('UPDATE messages SET recalled = 1 WHERE account_id = ? AND msg_id = ? AND recalled = 0').run(accountId, msgId).changes > 0
  }

  search(match: string, accountId: string | undefined, limit: number) {
    return this.db
      .query(
        `SELECT ${COLUMNS} FROM messages_fts f JOIN messages m ON m.id = f.rowid
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
        `SELECT CAST(r.msg_id AS TEXT) AS msg_id, r.icon, count(*) AS count, max(r.user_id = r.account_id) AS mine
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

  receipt(accountId: string, threadId: string, userId: string, msgId: number, seen: boolean) {
    const seenId = seen ? msgId : 0
    return (
      this.db
        .query(
          `INSERT INTO receipts (account_id, thread_id, user_id, delivered_msg_id, seen_msg_id) VALUES ($accountId, $threadId, $userId, $msgId, $seenId)
           ON CONFLICT DO UPDATE SET delivered_msg_id = max(delivered_msg_id, excluded.delivered_msg_id), seen_msg_id = max(seen_msg_id, excluded.seen_msg_id)
           WHERE excluded.delivered_msg_id > delivered_msg_id OR excluded.seen_msg_id > seen_msg_id`,
        )
        .run({ accountId, threadId, userId, msgId, seenId }).changes > 0
    )
  }

  receipts(accountId: string, threadId: string) {
    return this.db
      .query(
        `SELECT r.user_id, COALESCE(c.name, u.alias, u.display_name, u.zalo_name) AS name, u.avatar, r.delivered_msg_id, r.seen_msg_id
         FROM receipts r
         LEFT JOIN users u ON u.account_id = r.account_id AND u.id = r.user_id
         LEFT JOIN contacts c ON c.id = u.contact_id
         WHERE r.account_id = ? AND r.thread_id = ? ORDER BY r.seen_msg_id DESC`,
      )
      .all(accountId, threadId) as Receipt[]
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
