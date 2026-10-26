import type { AtRiskContact, Contact, ContactLink, Relation } from '../../../../types'

export type Friend = { id: string; displayName: string | null; zaloName: string | null; avatar: string | null; phone: string | null }

export type GroupInfoRow = { id: string; name: string | null; avatar: string | null; version: string }

export type Profile = { id: string; displayName: string | null; zaloName: string | null; avatar: string | null }

export type ContactPatch = Partial<Pick<Contact, 'name' | 'phone' | 'note'>>

export default interface IContactRepository {
  // Danh bạ theo nick (users, groups): bản sao từ Zalo
  ensureUser(accountId: string, uid: string, name: string | null): void
  ensureGroup(accountId: string, groupId: string): void
  setRelation(accountId: string, uid: string, relation: Relation): void
  // Thay toàn bộ danh sách bạn; ai không còn trong danh sách thì về 'none'. Gắn contact luôn trong cùng transaction
  syncFriends(accountId: string, friends: Friend[]): void
  markSent(accountId: string, uids: string[]): void
  setAliases(accountId: string, items: { userId: string; alias: string }[]): void
  groupVersions(accountId: string): Map<string, { version: string | null; isMember: boolean }>
  upsertGroups(accountId: string, groups: GroupInfoRow[]): void
  leaveGroups(accountId: string, keepIds: string[]): void
  invalidateGroup(accountId: string, groupId: string): void
  version(accountId: string, key: string): { value: string; synced_at: number } | undefined
  setVersion(accountId: string, key: string, value: string): void
  // Người lạ mới biết qua tin nhắn (riêng hoặc trong nhóm), chưa có hồ sơ Zalo (synced_at NULL)
  missingProfiles(accountId: string, limit: number): string[]
  // Đánh dấu cả lô đã hỏi, kể cả người Zalo không trả hồ sơ, để không hỏi lại mãi
  saveProfiles(accountId: string, askedIds: string[], profiles: Profile[]): void

  // Contacts: một người thật trên mọi nick
  // Gắn mọi dòng users là bạn, đang chờ kết bạn hoặc có chat riêng; uid = undefined thì cả nick
  link(accountId: string, uid?: string): void
  atRisk(minLinks: number): AtRiskContact[]
  get(id: number): Contact | undefined
  links(id: number): ContactLink[]
  phoneOwner(phone: string): number | undefined
  update(id: number, patch: ContactPatch): void
}
