import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { config } from '../config'
import { buildSearchText } from '../core/text/normalize'

export type Migration = string | ((db: Database) => void)

export const migrations: Migration[] = [
  `CREATE TABLE accounts (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     avatar      TEXT,
     credentials TEXT NOT NULL,
     created_at  INTEGER NOT NULL DEFAULT (unixepoch())
   );

   CREATE TABLE threads (
     account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id          TEXT NOT NULL,                  -- uid người dùng hoặc groupId
     type        INTEGER NOT NULL,               -- ThreadType: 0 User, 1 Group
     name        TEXT,
     avatar      TEXT,
     last_msg_at INTEGER,
     preview     TEXT,
     unread      INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, id)
   );
   CREATE TABLE messages (
     account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     msg_id      TEXT NOT NULL,
     thread_id   TEXT NOT NULL,
     thread_type INTEGER NOT NULL,
     from_id     TEXT NOT NULL,
     from_name   TEXT,
     is_self     INTEGER NOT NULL,
     ts          INTEGER NOT NULL,               -- ms
     msg_type    TEXT NOT NULL,                  -- 'webchat' = text, 'chat.photo', 'share.file', ...
     text        TEXT,                           -- content khi là string
     raw         TEXT NOT NULL,                  -- TMessage gốc: giữ hết, sau này parse thêm loại tin
     recalled    INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, msg_id)
   );
   CREATE INDEX messages_by_thread ON messages (account_id, thread_id, ts);`,
  `DROP INDEX messages_by_thread;
   CREATE INDEX messages_by_thread ON messages (account_id, thread_id, ts, msg_id);
   CREATE INDEX threads_by_last_msg ON threads (last_msg_at) WHERE last_msg_at IS NOT NULL;`,
  // v3: xem docs/database.md mục 5
  `ALTER TABLE accounts ADD COLUMN state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'locked', 'retired'));
   ALTER TABLE accounts ADD COLUMN state_at INTEGER;

   CREATE TABLE contacts (
     id         INTEGER PRIMARY KEY,
     name       TEXT,                         -- tên người dùng tự đặt; NULL = hiển thị theo tên Zalo
     phone      TEXT UNIQUE,                  -- chuẩn hoá dạng 84xxxxxxxxx
     zalo_uid   TEXT UNIQUE,                  -- vẫn còn kể cả khi nick bị xoá vĩnh viễn
     note       TEXT,
     created_at INTEGER NOT NULL
   ) STRICT;

   CREATE TABLE users (
     account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id           TEXT NOT NULL,
     display_name TEXT,
     zalo_name    TEXT,
     alias        TEXT,                       -- tên gợi nhớ do chính nick này đặt
     avatar       TEXT,
     relation     TEXT NOT NULL DEFAULT 'none' CHECK (relation IN ('none', 'friend', 'sent', 'received', 'blocked')),
     contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,  -- chỉ bước gắn contact ghi, sync không đụng
     synced_at    INTEGER,                    -- NULL = mới biết qua tin nhắn, chưa lấy hồ sơ
     PRIMARY KEY (account_id, id)
   ) STRICT;
   CREATE INDEX users_by_contact ON users (contact_id) WHERE contact_id IS NOT NULL;

   CREATE TABLE groups (
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id         TEXT NOT NULL,
     name       TEXT,
     avatar     TEXT,
     is_member  INTEGER NOT NULL DEFAULT 1,
     version    TEXT,                         -- từ gridVerMap; NULL = cần lấy lại info
     synced_at  INTEGER,
     PRIMARY KEY (account_id, id)
   ) STRICT;

   INSERT INTO users (account_id, id, display_name, avatar) SELECT account_id, id, name, avatar FROM threads WHERE type = 0;
   INSERT INTO groups (account_id, id, name, avatar) SELECT account_id, id, name, avatar FROM threads WHERE type = 1;

   CREATE TABLE threads_v3 (
     account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id          TEXT NOT NULL,               -- uid hoặc groupId, không có tiền tố u/g
     type        INTEGER NOT NULL,            -- ThreadType: 0 User, 1 Group
     last_msg_id TEXT,
     last_msg_at INTEGER,
     read_ts     INTEGER NOT NULL DEFAULT 0,  -- unread chỉ đếm tin của người khác có ts > read_ts
     unread      INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, id)
   ) STRICT;

   INSERT INTO threads_v3 (account_id, id, type, last_msg_id, last_msg_at, read_ts, unread)
   SELECT m.account_id, m.thread_id, m.thread_type, m.msg_id, m.ts, m.ts, COALESCE(t.unread, 0)
   FROM (SELECT *, row_number() OVER (PARTITION BY account_id, thread_id ORDER BY ts DESC, msg_id DESC) AS rn FROM messages) m
   LEFT JOIN threads t ON t.account_id = m.account_id AND t.id = m.thread_id
   WHERE m.rn = 1;

   CREATE TABLE messages_v3 (
     id          INTEGER PRIMARY KEY,         -- rowid ổn định cho FTS: VACUUM có thể đổi rowid ngầm
     account_id  TEXT NOT NULL,
     msg_id      TEXT NOT NULL,
     thread_id   TEXT NOT NULL,
     thread_type INTEGER NOT NULL,
     from_id     TEXT NOT NULL,
     from_name   TEXT,                        -- dName lúc gửi; tên hiện tại lấy từ users
     is_self     INTEGER NOT NULL,
     ts          INTEGER NOT NULL,            -- ms, giờ server Zalo
     msg_type    TEXT NOT NULL,
     text        TEXT,
     raw         TEXT NOT NULL,               -- TMessage gốc, không lấy lại được từ Zalo
     recalled    INTEGER NOT NULL DEFAULT 0,
     UNIQUE (account_id, msg_id),
     FOREIGN KEY (account_id, thread_id) REFERENCES threads (account_id, id) ON DELETE CASCADE
   ) STRICT;

   INSERT INTO messages_v3 (account_id, msg_id, thread_id, thread_type, from_id, from_name, is_self, ts, msg_type, text, raw, recalled)
   SELECT account_id, msg_id, thread_id, thread_type, from_id, from_name, is_self, ts, msg_type, text, raw, recalled
   FROM messages ORDER BY ts, msg_id;

   DROP TABLE messages;
   DROP TABLE threads;
   ALTER TABLE threads_v3 RENAME TO threads;
   ALTER TABLE messages_v3 RENAME TO messages;
   CREATE INDEX messages_by_thread ON messages (account_id, thread_id, ts, msg_id);
   CREATE INDEX threads_by_last_msg ON threads (last_msg_at) WHERE last_msg_at IS NOT NULL;

   CREATE VIRTUAL TABLE messages_fts USING fts5 (body, content = '', contentless_delete = 1, tokenize = 'unicode61 remove_diacritics 2');
   CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
     DELETE FROM messages_fts WHERE rowid = old.id;
   END;
   CREATE TRIGGER messages_fts_recall AFTER UPDATE OF recalled ON messages WHEN new.recalled = 1 BEGIN
     DELETE FROM messages_fts WHERE rowid = new.id;
   END;

   CREATE TABLE sync_state (
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     key        TEXT NOT NULL,                -- 'friends' | 'aliases' | 'groups' | 'messages.user' | 'messages.group'
     value      TEXT NOT NULL,                -- version Zalo trả về, hoặc msgId mốc liền mạch
     synced_at  INTEGER NOT NULL,
     PRIMARY KEY (account_id, key)
   ) STRICT, WITHOUT ROWID;`,
  // v4: removeDiacritics() là JS nên không làm được trong SQL
  (db) => {
    const insertFts = db.query('INSERT INTO messages_fts (rowid, body) VALUES (?, ?)')
    const rows = db.query('SELECT id, text, raw FROM messages WHERE recalled = 0').iterate() as Iterable<{ id: number; text: string | null; raw: string }>
    for (const row of rows) {
      const body = buildSearchText(row.text, JSON.parse(row.raw).content)
      if (body) insertFts.run(row.id, body)
    }
  },
  // v5: sticker gần đây cho khung chọn sticker, chỉ sticker mình gửi nên index rất nhỏ
  `CREATE INDEX messages_self_stickers ON messages (ts) WHERE msg_type = 'chat.sticker' AND is_self = 1;`,
  // v6: mỗi lần bấm thả là một dòng (Zalo đếm từng lần); icon '' = người đó gỡ hết các lần thả trước.
  // Không FK sang messages: cảm xúc kéo bù có thể về trước tin
  `CREATE TABLE reactions (
     account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     msg_id     TEXT    NOT NULL,             -- tin được thả
     id         TEXT    NOT NULL,             -- msgId của lần thả
     user_id    TEXT    NOT NULL,
     icon       TEXT    NOT NULL,             -- mã Zalo: '/-heart', '/-strong', ':>'...
     ts         INTEGER NOT NULL,
     PRIMARY KEY (account_id, msg_id, id)
   ) STRICT, WITHOUT ROWID;`,
  // v7: tin mới nhất của mình mà từng người đã nhận / đã xem, theo từng hội thoại.
  // Zalo chỉ báo "đã xem tới tin X" nên giữ mốc lớn nhất; msgId Zalo tăng dần và vừa INTEGER
  `CREATE TABLE receipts (
     account_id       TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     thread_id        TEXT    NOT NULL,
     user_id          TEXT    NOT NULL,     -- người nhận; hội thoại riêng thì = thread_id
     delivered_msg_id INTEGER NOT NULL DEFAULT 0,
     seen_msg_id      INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, thread_id, user_id)
   ) STRICT, WITHOUT ROWID;`,
]

export function migrate(db: Database, allMigrations = migrations) {
  const { user_version: fromVersion } = db.query('PRAGMA user_version').get() as { user_version: number }
  if (fromVersion >= allMigrations.length) return

  // DB đang có dữ liệu: giữ bản trước khi đổi schema làm đường lui (thay file .db bằng bản này rồi chạy code cũ)
  const backup = `${db.filename}.v${fromVersion}.bak`
  if (fromVersion > 0 && db.filename && db.filename !== ':memory:' && !existsSync(backup)) db.query('VACUUM INTO ?').run(backup)

  // PRAGMA foreign_keys không có tác dụng trong transaction. Để bật thì DROP bảng cũ khi rebuild sẽ cascade xoá bảng mới vừa chép
  db.run('PRAGMA foreign_keys = OFF')
  try {
    for (let version = fromVersion; version < allMigrations.length; version++) {
      db.transaction(() => {
        const migration = allMigrations[version]
        typeof migration === 'string' ? db.run(migration) : migration(db)
        const broken = db.query('PRAGMA foreign_key_check').all()
        if (broken.length) throw new Error(`migration ${version + 1}: foreign_key_check ${JSON.stringify(broken)}`)
        db.run(`PRAGMA user_version = ${version + 1}`)
      })()
    }
  } finally {
    db.run('PRAGMA foreign_keys = ON')
  }
}

export function openDatabase(path: string) {
  const db = new Database(path, { create: true, strict: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  db.run('PRAGMA optimize = 0x10002')
  return db
}

export const db = openDatabase(config.dbPath)
