import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import { TOKENS } from '../../../../di/tokens'
import type { AtRiskContact, Contact, ContactLink, Relation } from '../../../../types'
import type IContactRepository from '../interfaces/contact-repository'
import type { ContactPatch, Friend, GroupInfoRow, Profile } from '../interfaces/contact-repository'

// Ai là bạn, đang chờ kết bạn, hoặc đã có chat riêng thì là một người cần giữ liên lạc
const LINKABLE_USER_FILTER = `(relation <> 'none' OR EXISTS (SELECT 1 FROM threads t WHERE t.account_id = users.account_id AND t.id = users.id AND t.type = 0))`

@injectable()
export default class ContactRepository implements IContactRepository {
  constructor(@inject(TOKENS.Database) private db: Database) {}

  ensureUser(accountId: string, uid: string, name: string | null) {
    this.db
      .query(
        `INSERT INTO users (account_id, id, display_name) VALUES (?, ?, ?)
         ON CONFLICT (account_id, id) DO UPDATE SET display_name = COALESCE(users.display_name, excluded.display_name)`,
      )
      .run(accountId, uid, name)
  }

  ensureGroup(accountId: string, groupId: string) {
    this.db.query('INSERT INTO groups (account_id, id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(accountId, groupId)
  }

  setRelation(accountId: string, uid: string, relation: Relation) {
    this.db
      .query('INSERT INTO users (account_id, id, relation) VALUES (?, ?, ?) ON CONFLICT (account_id, id) DO UPDATE SET relation = excluded.relation')
      .run(accountId, uid, relation)
  }

  syncFriends(accountId: string, friends: Friend[]) {
    const upsert = this.db.query(
      `INSERT INTO users (account_id, id, display_name, zalo_name, avatar, phone, relation, synced_at)
       VALUES ($accountId, $id, $displayName, $zaloName, $avatar, $phone, 'friend', $now)
       ON CONFLICT (account_id, id) DO UPDATE SET display_name = excluded.display_name, zalo_name = excluded.zalo_name,
         avatar = excluded.avatar, phone = COALESCE(excluded.phone, users.phone), relation = 'friend', synced_at = excluded.synced_at`,
    )
    // Trùng SĐT với người đã có thì gộp vào người đó trước khi gắn theo uid: cách duy nhất gộp khi uid không toàn cục
    const linkByPhone = this.db.query(
      'UPDATE users SET contact_id = (SELECT id FROM contacts WHERE phone = $phone) WHERE account_id = $accountId AND id = $id AND contact_id IS NULL',
    )
    const keepPhone = this.db.query(
      `UPDATE contacts SET phone = $phone
       WHERE id = (SELECT contact_id FROM users WHERE account_id = $accountId AND id = $id) AND phone IS NULL
         AND NOT EXISTS (SELECT 1 FROM contacts WHERE phone = $phone)`,
    )
    const now = Date.now()
    this.db.transaction(() => {
      this.db.query("UPDATE users SET relation = 'none' WHERE account_id = ? AND relation = 'friend'").run(accountId)
      for (const friend of friends) {
        upsert.run({ accountId, now, ...friend })
        if (friend.phone) linkByPhone.run({ accountId, id: friend.id, phone: friend.phone })
      }
      this.link(accountId)
      for (const friend of friends) if (friend.phone) keepPhone.run({ accountId, id: friend.id, phone: friend.phone })
    })()
  }

  markSent(accountId: string, uids: string[]) {
    const insertSent = this.db.query(
      "INSERT INTO users (account_id, id, relation) VALUES (?, ?, 'sent') ON CONFLICT (account_id, id) DO UPDATE SET relation = 'sent' WHERE users.relation = 'none'",
    )
    this.db.transaction(() => {
      this.db.query("UPDATE users SET relation = 'none' WHERE account_id = ? AND relation = 'sent'").run(accountId)
      for (const uid of uids) insertSent.run(accountId, uid)
    })()
  }

  setAliases(accountId: string, items: { userId: string; alias: string }[]) {
    const setAlias = this.db.query('INSERT INTO users (account_id, id, alias) VALUES (?, ?, ?) ON CONFLICT (account_id, id) DO UPDATE SET alias = excluded.alias')
    this.db.transaction(() => {
      this.db.query('UPDATE users SET alias = NULL WHERE account_id = ? AND alias IS NOT NULL').run(accountId)
      for (const { userId, alias } of items) setAlias.run(accountId, userId, alias)
    })()
  }

  groupVersions(accountId: string) {
    const rows = this.db.query('SELECT id, version, is_member FROM groups WHERE account_id = ?').all(accountId) as { id: string; version: string | null; is_member: number }[]
    return new Map(rows.map((g) => [g.id, { version: g.version, isMember: g.is_member === 1 }]))
  }

  upsertGroups(accountId: string, groups: GroupInfoRow[]) {
    const upsert = this.db.query(
      `INSERT INTO groups (account_id, id, name, avatar, description, creator_id, total_member, is_member, version, synced_at)
       VALUES ($accountId, $id, $name, $avatar, $description, $creatorId, $totalMember, 1, $version, $now)
       ON CONFLICT (account_id, id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, description = excluded.description,
         creator_id = excluded.creator_id, total_member = excluded.total_member, is_member = 1, version = excluded.version, synced_at = excluded.synced_at`,
    )
    const clearMembers = this.db.query('DELETE FROM group_members WHERE account_id = ? AND group_id = ?')
    const addMember = this.db.query('INSERT INTO group_members (account_id, group_id, user_id, role) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET role = excluded.role')
    const now = Date.now()
    this.db.transaction(() => {
      for (const { members, ...group } of groups) {
        upsert.run({ accountId, now, ...group })
        clearMembers.run(accountId, group.id)
        for (const { id, role } of members) addMember.run(accountId, group.id, id, role)
      }
    })()
  }

  leaveGroups(accountId: string, keepIds: string[]) {
    this.db
      .query('UPDATE groups SET is_member = 0 WHERE account_id = ? AND is_member = 1 AND id NOT IN (SELECT value FROM json_each(?))')
      .run(accountId, JSON.stringify(keepIds))
  }

  invalidateGroup(accountId: string, groupId: string) {
    this.db.query('INSERT INTO groups (account_id, id) VALUES (?, ?) ON CONFLICT (account_id, id) DO UPDATE SET version = NULL').run(accountId, groupId)
  }

  version(accountId: string, key: string) {
    return (this.db.query('SELECT value, synced_at FROM sync_state WHERE account_id = ? AND key = ?').get(accountId, key) as { value: string; synced_at: number } | null) ?? undefined
  }

  setVersion(accountId: string, key: string, value: string) {
    this.db
      .query(
        `INSERT INTO sync_state (account_id, key, value, synced_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (account_id, key) DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`,
      )
      .run(accountId, key, value, Date.now())
  }

  missingProfiles(accountId: string, limit: number) {
    const rows = this.db
      .query(
        `SELECT u.id FROM users u LEFT JOIN threads t ON t.account_id = u.account_id AND t.id = u.id AND t.type = 0
         WHERE u.account_id = ? AND u.synced_at IS NULL ORDER BY (t.id IS NOT NULL) DESC, t.last_msg_at DESC NULLS LAST LIMIT ?`,
      )
      .all(accountId, limit) as { id: string }[]
    return rows.map((r) => r.id)
  }

  saveProfiles(accountId: string, askedIds: string[], profiles: Profile[]) {
    const markAsked = this.db.query(
      `INSERT INTO users (account_id, id, synced_at) VALUES ($accountId, $id, $now)
       ON CONFLICT (account_id, id) DO UPDATE SET synced_at = excluded.synced_at`,
    )
    const saveProfile = this.db.query(
      `INSERT INTO users (account_id, id, display_name, zalo_name, avatar, phone, synced_at)
       VALUES ($accountId, $id, $displayName, $zaloName, $avatar, $phone, $now)
       ON CONFLICT (account_id, id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, users.display_name),
         zalo_name = COALESCE(excluded.zalo_name, users.zalo_name),
         avatar = COALESCE(excluded.avatar, users.avatar),
         phone = COALESCE(excluded.phone, users.phone),
         synced_at = excluded.synced_at`,
    )
    const now = Date.now()
    this.db.transaction(() => {
      for (const id of askedIds) markAsked.run({ accountId, id, now })
      for (const profile of profiles) saveProfile.run({ accountId, now, phone: null, ...profile })
    })()
  }

  // Ghép theo uid luôn an toàn: uid toàn cục thì hai nick tự gộp về một người, không toàn cục thì không bao giờ trùng
  link(accountId: string, uid?: string) {
    const params = { accountId, uid: uid ?? null, now: Date.now() }
    const userFilter = uid === undefined ? '' : 'AND id = $uid'
    this.db
      .query(
        `INSERT INTO contacts (zalo_uid, created_at)
         SELECT id, $now FROM users
         WHERE account_id = $accountId ${userFilter} AND contact_id IS NULL AND ${LINKABLE_USER_FILTER}
         ON CONFLICT (zalo_uid) DO NOTHING`,
      )
      .run(params)
    this.db
      .query(
        `UPDATE users SET contact_id = (SELECT c.id FROM contacts c WHERE c.zalo_uid = users.id)
         WHERE account_id = $accountId ${userFilter} AND contact_id IS NULL AND ${LINKABLE_USER_FILTER}`,
      )
      .run({ accountId: params.accountId, uid: params.uid })
  }

  atRisk(minLinks: number) {
    return this.db
      .query(
        `SELECT c.id, COALESCE(c.name, max(u.alias), max(u.display_name), max(u.zalo_name)) AS name, c.phone, max(u.avatar) AS avatar,
                count(DISTINCT IIF(u.relation = 'friend', a.id, NULL)) AS live,
                count(DISTINCT a.id) AS reach
         FROM contacts c
         LEFT JOIN users u ON u.contact_id = c.id
         LEFT JOIN accounts a ON a.id = u.account_id AND a.state = 'active'
         GROUP BY c.id
         HAVING live < ?
         ORDER BY live, reach, c.id`,
      )
      .all(minLinks) as AtRiskContact[]
  }

  get(id: number) {
    return (this.db.query('SELECT id, name, phone, zalo_uid, note, created_at FROM contacts WHERE id = ?').get(id) as Contact | null) ?? undefined
  }

  links(id: number) {
    return this.db
      .query(
        `SELECT u.account_id, a.name AS account_name, a.state AS account_state, u.id AS user_id, u.relation,
                COALESCE(u.alias, u.display_name, u.zalo_name) AS name, u.avatar
         FROM users u JOIN accounts a ON a.id = u.account_id
         WHERE u.contact_id = ?
         ORDER BY a.created_at, a.rowid`,
      )
      .all(id) as ContactLink[]
  }

  userByPhone(accountId: string, phone: string) {
    return (this.db.query('SELECT id FROM users WHERE account_id = ? AND phone = ?').get(accountId, phone) as { id: string } | null)?.id
  }

  phoneOwner(phone: string) {
    return (this.db.query('SELECT id FROM contacts WHERE phone = ?').get(phone) as { id: number } | null)?.id
  }

  update(id: number, patch: ContactPatch) {
    const keys = (['name', 'phone', 'note'] as const).filter((k) => k in patch)
    if (!keys.length) return
    this.db
      .query(`UPDATE contacts SET ${keys.map((k) => `${k} = $${k}`).join(', ')} WHERE id = $id`)
      .run({ id, ...Object.fromEntries(keys.map((k) => [k, patch[k] ?? null])) })
  }
}
