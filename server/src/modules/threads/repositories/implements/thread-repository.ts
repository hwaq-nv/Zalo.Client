import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import type { ThreadType } from 'zca-js'
import { TOKENS } from '../../../../di/tokens'
import type { ThreadRow } from '../../../../types'
import type IThreadRepository from '../interfaces/thread-repository'
import type { ThreadActivity } from '../interfaces/thread-repository'

const PREVIEW: Record<string, string> = {
  'chat.photo': '[Hình ảnh]',
  'chat.sticker': '[Sticker]',
  'chat.gif': '[GIF]',
  'chat.voice': '[Tin nhắn thoại]',
  'chat.video.msg': '[Video]',
  'share.file': '[Tệp]',
  'chat.recommended': '[Liên kết]',
  'chat.location.new': '[Vị trí]',
  'recommened.calltime': '[Cuộc gọi]',
  'recommened.misscall': '[Cuộc gọi nhỡ]',
}

// Tên người: tên tự đặt cho contact > tên gợi nhớ của nick > tên Zalo
const LIST = `SELECT t.account_id, a.name AS account_name, t.id, t.type,
       IIF(t.type = 0, COALESCE(c.name, u.alias, u.display_name, u.zalo_name), g.name) AS name,
       IIF(t.type = 0, u.avatar, g.avatar) AS avatar,
       t.last_msg_at, t.unread, u.contact_id, m.msg_type, m.text, m.recalled,
       IIF(m.msg_type = 'chat.recommended', json_extract(m.raw, '$.content.action')) AS action
  FROM threads t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN users u ON t.type = 0 AND u.account_id = t.account_id AND u.id = t.id
  LEFT JOIN contacts c ON c.id = u.contact_id
  LEFT JOIN groups g ON t.type = 1 AND g.account_id = t.account_id AND g.id = t.id
  LEFT JOIN messages m ON m.account_id = t.account_id AND m.msg_id = t.last_msg_id`

type ListRow = Omit<ThreadRow, 'preview'> & { msg_type: string | null; text: string | null; recalled: 0 | 1 | null; action: string | null }

// Preview tính lúc đọc từ tin cuối nên thu hồi xong là tự đúng
const toThread = ({ msg_type, text, recalled, action, ...t }: ListRow): ThreadRow => ({
  ...t,
  preview: msg_type === null ? null : recalled ? 'Tin nhắn đã được thu hồi' : (text ?? PREVIEW[action ?? ''] ?? PREVIEW[msg_type] ?? '[Tin nhắn]'),
})

@injectable()
export default class ThreadRepository implements IThreadRepository {
  constructor(@inject(TOKENS.Database) private db: Database) {}

  list(accountId?: string) {
    const rows = this.db
      .query(`${LIST} WHERE t.last_msg_at IS NOT NULL AND ($accountId IS NULL OR t.account_id = $accountId) ORDER BY t.last_msg_at DESC`)
      .all({ accountId: accountId ?? null }) as ListRow[]
    return rows.map(toThread)
  }

  contacts(accountId: string) {
    return this.db
      .query(
        `SELECT u.account_id, a.name AS account_name, u.id, 0 AS type, COALESCE(c.name, u.alias, u.display_name, u.zalo_name) AS name,
                u.avatar, t.last_msg_at, NULL AS preview, COALESCE(t.unread, 0) AS unread, u.contact_id
         FROM users u
         JOIN accounts a ON a.id = u.account_id
         LEFT JOIN contacts c ON c.id = u.contact_id
         LEFT JOIN threads t ON t.account_id = u.account_id AND t.id = u.id
         WHERE u.account_id = $accountId AND u.relation = 'friend'
         UNION ALL
         SELECT g.account_id, a.name, g.id, 1, g.name, g.avatar, t.last_msg_at, NULL, COALESCE(t.unread, 0), NULL
         FROM groups g
         JOIN accounts a ON a.id = g.account_id
         LEFT JOIN threads t ON t.account_id = g.account_id AND t.id = g.id
         WHERE g.account_id = $accountId AND g.is_member = 1
         ORDER BY name`,
      )
      .all({ accountId }) as ThreadRow[]
  }

  typeOf(accountId: string, id: string) {
    const row = this.db
      .query(
        `SELECT type FROM threads WHERE account_id = $accountId AND id = $id
         UNION ALL SELECT 0 FROM users WHERE account_id = $accountId AND id = $id
         UNION ALL SELECT 1 FROM groups WHERE account_id = $accountId AND id = $id
         LIMIT 1`,
      )
      .get({ accountId, id }) as { type: ThreadType } | null
    return row?.type
  }

  profile(accountId: string, id: string) {
    const row = this.db
      .query(
        `SELECT COALESCE(c.name, u.alias, u.display_name, u.zalo_name) AS name, u.avatar FROM users u
         LEFT JOIN contacts c ON c.id = u.contact_id WHERE u.account_id = $accountId AND u.id = $id
         UNION ALL SELECT name, avatar FROM groups WHERE account_id = $accountId AND id = $id
         LIMIT 1`,
      )
      .get({ accountId, id }) as { name: string | null; avatar: string | null } | null
    return row ?? undefined
  }

  ensure(accountId: string, id: string, type: ThreadType) {
    this.db.query('INSERT INTO threads (account_id, id, type) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(accountId, id, type)
  }

  advance({ accountId, id, msgId, ts, read }: ThreadActivity) {
    this.db
      .query(
        `UPDATE threads SET
           last_msg_id = IIF(last_msg_at IS NULL OR ($ts, $msgId) > (last_msg_at, last_msg_id), $msgId, last_msg_id),
           last_msg_at = MAX(COALESCE(last_msg_at, 0), $ts),
           unread = unread + ($read = 0 AND $ts > read_ts)
         WHERE account_id = $accountId AND id = $id`,
      )
      .run({ accountId, id, msgId, ts, read: read ? 1 : 0 })
    if (!read) return
    // Đã đọc tới ts: chỉ còn chưa đọc những tin của người khác mới hơn, đếm lại bằng index (account_id, thread_id, ts)
    this.db
      .query(
        `UPDATE threads SET
           read_ts = $ts,
           unread = (SELECT count(*) FROM messages WHERE account_id = $accountId AND thread_id = $id AND is_self = 0 AND ts > $ts)
         WHERE account_id = $accountId AND id = $id AND read_ts < $ts`,
      )
      .run({ accountId, id, ts })
  }

  markRead(accountId: string, id: string) {
    return (
      this.db
        .query('UPDATE threads SET read_ts = MAX(read_ts, COALESCE(last_msg_at, 0)), unread = 0 WHERE account_id = ? AND id = ?')
        .run(accountId, id).changes > 0
    )
  }
}
