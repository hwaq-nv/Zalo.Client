import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { config } from '../config'

export type Migration = string | ((db: Database) => void)

export const migrations: Migration[] = [
  `CREATE TABLE accounts (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     avatar      TEXT,
     credentials TEXT NOT NULL,
     state       TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'locked', 'retired')),
     state_at    INTEGER,
     created_at  INTEGER NOT NULL DEFAULT (unixepoch())
   ) STRICT;

   CREATE TABLE sync_state (
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     key        TEXT NOT NULL,
     value      TEXT NOT NULL,
     synced_at  INTEGER NOT NULL,
     PRIMARY KEY (account_id, key)
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE contacts (
     id         INTEGER PRIMARY KEY,
     name       TEXT,
     phone      TEXT UNIQUE,
     zalo_uid   TEXT UNIQUE,
     note       TEXT,
     created_at INTEGER NOT NULL
   ) STRICT;

   CREATE TABLE users (
     account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id           TEXT NOT NULL,
     display_name TEXT,
     zalo_name    TEXT,
     alias        TEXT,
     avatar       TEXT,
     phone        TEXT,
     relation     TEXT NOT NULL DEFAULT 'none' CHECK (relation IN ('none', 'friend', 'sent', 'received', 'blocked')),
     contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
     synced_at    INTEGER,
     PRIMARY KEY (account_id, id)
   ) STRICT;
   CREATE INDEX users_by_phone ON users (account_id, phone) WHERE phone IS NOT NULL;
   CREATE INDEX users_by_contact ON users (contact_id) WHERE contact_id IS NOT NULL;

   CREATE TABLE groups (
     account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id           TEXT NOT NULL,
     name         TEXT,
     avatar       TEXT,
     description  TEXT,
     creator_id   TEXT,
     total_member INTEGER,
     is_member    INTEGER NOT NULL DEFAULT 1,
     version      TEXT,
     synced_at    INTEGER,
     PRIMARY KEY (account_id, id)
   ) STRICT;

   CREATE TABLE group_members (
     account_id TEXT NOT NULL,
     group_id   TEXT NOT NULL,
     user_id    TEXT NOT NULL,
     role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
     PRIMARY KEY (account_id, group_id, user_id),
     FOREIGN KEY (account_id, group_id) REFERENCES groups (account_id, id) ON DELETE CASCADE
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX group_members_by_user ON group_members (account_id, user_id);

   CREATE TABLE threads (
     account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id             TEXT NOT NULL,
     type           INTEGER NOT NULL,
     last_msg_id    INTEGER,
     last_msg_at    INTEGER,
     read_ts        INTEGER NOT NULL DEFAULT 0,
     unread         INTEGER NOT NULL DEFAULT 0,
     mention_unread INTEGER NOT NULL DEFAULT 0,
     marked_unread  INTEGER NOT NULL DEFAULT 0,
     pinned_at      INTEGER,
     muted_until    INTEGER,
     hidden         INTEGER NOT NULL DEFAULT 0,
     ttl            INTEGER,
     draft          TEXT,
     PRIMARY KEY (account_id, id)
   ) STRICT;
   CREATE INDEX threads_by_last_msg ON threads (last_msg_at) WHERE last_msg_at IS NOT NULL;

   CREATE TABLE messages (
     id           INTEGER PRIMARY KEY,
     account_id   TEXT    NOT NULL,
     thread_id    TEXT    NOT NULL,
     thread_type  INTEGER NOT NULL,
     msg_id       INTEGER NOT NULL,
     cli_msg_id   INTEGER,
     from_id      TEXT    NOT NULL,
     from_name    TEXT,
     is_self      INTEGER NOT NULL,
     ts           INTEGER NOT NULL,
     msg_type     TEXT    NOT NULL,
     text         TEXT,
     raw          TEXT    NOT NULL,
     quote_msg_id INTEGER,
     recalled     INTEGER NOT NULL DEFAULT 0,
     deleted      INTEGER NOT NULL DEFAULT 0,
     starred_at   INTEGER,
     expires_at   INTEGER,
     UNIQUE (account_id, msg_id),
     FOREIGN KEY (account_id, thread_id) REFERENCES threads (account_id, id) ON DELETE CASCADE
   ) STRICT;
   CREATE INDEX messages_by_thread ON messages (account_id, thread_id, ts, msg_id);
   CREATE INDEX messages_media ON messages (account_id, thread_id, msg_type, ts) WHERE msg_type IN ('chat.photo', 'chat.video.msg', 'share.file', 'chat.recommended');
   CREATE INDEX messages_starred ON messages (account_id, starred_at) WHERE starred_at IS NOT NULL;
   CREATE INDEX messages_expiring ON messages (expires_at) WHERE expires_at IS NOT NULL;
   CREATE INDEX messages_self_stickers ON messages (ts) WHERE msg_type = 'chat.sticker' AND is_self = 1;

   CREATE VIRTUAL TABLE messages_fts USING fts5 (body, content = '', contentless_delete = 1, tokenize = 'unicode61 remove_diacritics 2');
   CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
     DELETE FROM messages_fts WHERE rowid = old.id;
   END;
   CREATE TRIGGER messages_fts_recall AFTER UPDATE OF recalled ON messages WHEN new.recalled = 1 BEGIN
     DELETE FROM messages_fts WHERE rowid = new.id;
   END;

   CREATE TABLE reactions (
     account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     msg_id     INTEGER NOT NULL,
     id         TEXT    NOT NULL,
     user_id    TEXT    NOT NULL,
     icon       TEXT    NOT NULL,
     ts         INTEGER NOT NULL,
     PRIMARY KEY (account_id, msg_id, id)
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE receipts (
     account_id       TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     thread_id        TEXT    NOT NULL,
     user_id          TEXT    NOT NULL,
     delivered_msg_id INTEGER NOT NULL DEFAULT 0,
     seen_msg_id      INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, thread_id, user_id)
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE message_gaps (
     account_id TEXT    NOT NULL,
     thread_id  TEXT    NOT NULL,
     from_ts    INTEGER NOT NULL,
     to_ts      INTEGER NOT NULL,
     reason     TEXT,
     PRIMARY KEY (account_id, thread_id, from_ts),
     FOREIGN KEY (account_id, thread_id) REFERENCES threads (account_id, id) ON DELETE CASCADE
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE labels (
     account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id         INTEGER NOT NULL,
     text       TEXT    NOT NULL,
     color      TEXT,
     emoji      TEXT,
     position   INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, id)
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE thread_labels (
     account_id TEXT    NOT NULL,
     label_id   INTEGER NOT NULL,
     thread_id  TEXT    NOT NULL,
     PRIMARY KEY (account_id, label_id, thread_id),
     FOREIGN KEY (account_id, label_id) REFERENCES labels (account_id, id) ON DELETE CASCADE
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE polls (
     account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id         INTEGER NOT NULL,
     group_id   TEXT    NOT NULL,
     creator_id TEXT,
     question   TEXT    NOT NULL,
     options    TEXT    NOT NULL,
     closed     INTEGER NOT NULL DEFAULT 0,
     expires_at INTEGER,
     updated_at INTEGER,
     raw        TEXT    NOT NULL,
     PRIMARY KEY (account_id, id)
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE reminders (
     account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id         TEXT    NOT NULL,
     thread_id  TEXT    NOT NULL,
     creator_id TEXT,
     title      TEXT,
     start_at   INTEGER NOT NULL,
     repeat     INTEGER NOT NULL DEFAULT 0,
     raw        TEXT    NOT NULL,
     PRIMARY KEY (account_id, id)
   ) STRICT, WITHOUT ROWID;

   CREATE TABLE todos (
     account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     id         TEXT    NOT NULL,
     thread_id  TEXT,
     creator_id TEXT,
     content    TEXT    NOT NULL,
     status     INTEGER NOT NULL DEFAULT 0,
     due_at     INTEGER,
     updated_at INTEGER,
     raw        TEXT    NOT NULL,
     PRIMARY KEY (account_id, id)
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
