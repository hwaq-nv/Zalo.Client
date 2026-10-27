import { inject, injectable } from 'inversify'
import { FriendEventType, type API, type FriendEvent, type GroupEvent, type GroupInfo } from '@hwqnq/zca-js'
import { BadRequestError, broadcast, ConflictError, logger, normalizePhone, NotFoundError } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type { Relation } from '../../../../types'
import type { MiniProfile } from '../../../../third-party/zalo/types'
import type IContactRepository from '../../repositories/interfaces/contact-repository'
import type { GroupMember, Profile } from '../../repositories/interfaces/contact-repository'
import type { UpdateContactRequest } from '../../dtos/requests/contact.request'
import type IContactService from '../interfaces/contact-service'

const GROUP_INFO_BATCH_SIZE = 50
const ALIAS_PAGE_SIZE = 100
const ALIAS_MAX_PAGES = 100
// Version chỉ là tối ưu: quá hạn này thì đồng bộ đủ, phòng khi hiểu sai nghĩa version của Zalo
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const GROUP_RESYNC_DELAY_MS = 2000
const PROFILE_BATCH_SIZE = 100
const PROFILE_FETCH_DELAY_MS = 500
const PROFILE_BATCH_GAP_MS = 1000
const PROFILE_RETRY_DELAY_MS = 60_000
const PROFILE_RETRY_MAX_MS = 30 * 60_000
const PROFILE_RATE_LIMIT_DELAY_MS = 60 * 60_000

@injectable()
export default class ContactService implements IContactService {
  private groupSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private profileTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private profileCooldownUntil = new Map<string, number>()

  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.ContactRepository) private contacts: IContactRepository,
  ) {
    zalo.on('attached', (id, api) => {
      this.sync(id, api).catch((err) => logger.error('sync contacts', { id, err }))
    })
    zalo.on('friend_event', (id, e) => this.onFriendEvent(id, e))
    zalo.on('group_event', (id, e) => this.onGroupEvent(id, e))
    zalo.on('message', (id, m) => {
      if (!m.isSelf) this.scheduleProfileRefresh(id)
    })
    zalo.on('old_messages', (id) => this.scheduleProfileRefresh(id))
  }

  async sync(accountId: string, api: API) {
    const versions = api.getContext().extraVer
    await this.syncIfChanged(accountId, 'friends', versions?.friend, async () => {
      const friends = await api.getAllFriends()
      this.contacts.syncFriends(
        accountId,
        friends.map((f) => ({
          id: f.userId,
          displayName: f.displayName || null,
          zaloName: f.zaloName || null,
          avatar: f.avatar || null,
          phone: f.phoneNumber ? normalizePhone(f.phoneNumber) : null,
        })),
      )
    })
    await this.syncIfChanged(accountId, 'aliases', versions?.alias, async () => {
      const items = []
      for (let page = 1; page <= ALIAS_MAX_PAGES; page++) {
        const { items: batch } = await api.getAliasList(ALIAS_PAGE_SIZE, page)
        items.push(...batch)
        if (batch.length < ALIAS_PAGE_SIZE) break
      }
      this.contacts.setAliases(accountId, items)
    })
    this.contacts.markSent(accountId, Object.keys(await api.getSentFriendRequest()))
    await this.syncGroups(accountId, api)
    this.contacts.link(accountId)
    broadcast({ type: 'threads', accountId })
    this.scheduleProfileRefresh(accountId)
  }

  atRisk(minLinks: number) {
    return this.contacts.atRisk(minLinks)
  }

  get(id: number) {
    const contact = this.contacts.get(id)
    if (!contact) throw new NotFoundError('contact not found')
    return { ...contact, links: this.contacts.links(id) }
  }

  update(id: number, patch: UpdateContactRequest) {
    if (!this.contacts.get(id)) throw new NotFoundError('contact not found')
    const changes = { ...patch }
    if (patch.phone != null) {
      const phone = normalizePhone(patch.phone)
      if (!phone) throw new BadRequestError('invalid phone', 'INVALID_PHONE')
      const owner = this.contacts.phoneOwner(phone)
      if (owner !== undefined && owner !== id) throw new ConflictError('phone already belongs to another contact', 'PHONE_TAKEN')
      changes.phone = phone
    }
    this.contacts.update(id, changes)
    return this.contacts.get(id)!
  }

  private async syncIfChanged(accountId: string, key: string, version: string | undefined, run: () => Promise<void>) {
    const last = this.contacts.version(accountId, key)
    if (version && last?.value === version && Date.now() - last.synced_at < FULL_SYNC_INTERVAL_MS) return
    await run()
    if (version) this.contacts.setVersion(accountId, key, version)
  }

  // getAllGroups trả version từng nhóm: chỉ gọi getGroupInfo cho nhóm mới, nhóm đã đổi, hoặc nhóm vừa có sự kiện
  private async syncGroups(accountId: string, api: API) {
    const { gridVerMap } = await api.getAllGroups()
    const known = this.contacts.groupVersions(accountId)
    const changed = Object.keys(gridVerMap).filter((id) => {
      const group = known.get(id)
      return !group?.isMember || group.version !== gridVerMap[id]
    })
    for (let i = 0; i < changed.length; i += GROUP_INFO_BATCH_SIZE) {
      const ids = changed.slice(i, i + GROUP_INFO_BATCH_SIZE)
      const { gridInfoMap } = await api.getGroupInfo(ids)
      this.contacts.upsertGroups(
        accountId,
        ids.map((id) => {
          const group = gridInfoMap[id]
          return {
            id,
            name: group?.name ?? null,
            avatar: group?.avt || group?.fullAvt || null,
            description: group?.desc || null,
            creatorId: group?.creatorId || null,
            totalMember: group?.totalMember ?? null,
            version: gridVerMap[id],
            members: group ? groupMembers(group) : [],
          }
        }),
      )
      const members: Profile[] = Object.values(gridInfoMap).flatMap((g) =>
        (g?.currentMems ?? []).map((m) => ({
          id: m.id,
          displayName: m.dName || null,
          zaloName: m.zaloName || null,
          avatar: m.avatar || m.avatar_25 || null,
        })),
      )
      if (members.length) this.contacts.saveProfiles(accountId, members.map((m) => m.id), members)
    }
    this.contacts.leaveGroups(accountId, Object.keys(gridVerMap))
  }

  private async refreshProfiles(accountId: string) {
    for (let ids = this.contacts.missingProfiles(accountId, PROFILE_BATCH_SIZE); ids.length; ids = this.contacts.missingProfiles(accountId, PROFILE_BATCH_SIZE)) {
      try {
        const mini = await this.zalo.miniProfiles(accountId, ids)
        const entries = mini && typeof mini === 'object' ? (Array.isArray(mini) ? mini : Object.entries(mini)) : []
        const profiles: Profile[] = entries
          .map((item) => {
            const [uid, p] = Array.isArray(item) ? [item[0], item[1] as MiniProfile] : [(item as MiniProfile).userId ?? '', item as MiniProfile]
            return {
              id: p?.userId || uid,
              displayName: p?.displayName || p?.zaloName || null,
              zaloName: p?.zaloName || null,
              avatar: p?.avatar || null,
            }
          })
          .filter((p) => Boolean(p.id))
        this.contacts.saveProfiles(accountId, ids, profiles)
        broadcast({ type: 'threads', accountId })
        await Bun.sleep(PROFILE_BATCH_GAP_MS)
      } catch (err) {
        this.contacts.saveProfiles(accountId, ids, [])
        throw err
      }
    }
  }

  scheduleProfileRefresh(accountId: string, delay = PROFILE_FETCH_DELAY_MS) {
    const cooldown = this.profileCooldownUntil.get(accountId) ?? 0
    if (Date.now() < cooldown) return
    if (this.profileTimers.has(accountId)) return
    this.profileTimers.set(
      accountId,
      setTimeout(async () => {
        try {
          if (this.zalo.getApi(accountId)) await this.refreshProfiles(accountId)
          this.profileTimers.delete(accountId)
        } catch (err: unknown) {
          logger.error('fetch profiles', { accountId, err })
          this.profileTimers.delete(accountId)
          const isRateLimit = (err as { error_code?: number })?.error_code === 221 || String(err).includes('221')
          const retryDelay = isRateLimit ? PROFILE_RATE_LIMIT_DELAY_MS : Math.min(Math.max(delay * 2, PROFILE_RETRY_DELAY_MS), PROFILE_RETRY_MAX_MS)
          if (isRateLimit) this.profileCooldownUntil.set(accountId, Date.now() + retryDelay)
          this.scheduleProfileRefresh(accountId, retryDelay)
        }
      }, delay),
    )
  }

  private onFriendEvent(accountId: string, event: FriendEvent) {
    const change = getRelationChange(accountId, event)
    if (!change) return
    this.contacts.setRelation(accountId, change.uid, change.relation)
    this.contacts.link(accountId, change.uid)
  }

  // Sự kiện nhóm chỉ là tín hiệu "nhóm này vừa đổi": lấy lại info theo version thay vì đọc từng loại sự kiện
  private onGroupEvent(accountId: string, event: GroupEvent) {
    this.contacts.invalidateGroup(accountId, event.threadId)
    clearTimeout(this.groupSyncTimers.get(accountId))
    this.groupSyncTimers.set(
      accountId,
      setTimeout(() => {
        this.groupSyncTimers.delete(accountId)
        const api = this.zalo.getApi(accountId)
        if (!api) return
        this.syncGroups(accountId, api)
          .then(() => broadcast({ type: 'threads', accountId }))
          .catch((err) => logger.error('sync groups', { accountId, err }))
      }, GROUP_RESYNC_DELAY_MS),
    )
  }
}

function groupMembers(group: Partial<GroupInfo>): GroupMember[] {
  const roles = new Map<string, GroupMember['role']>()
  for (const id of group.memberIds?.length ? group.memberIds : (group.currentMems ?? []).map((m) => m.id)) roles.set(id, 'member')
  for (const id of group.adminIds ?? []) roles.set(id, 'admin')
  if (group.creatorId) roles.set(group.creatorId, 'owner')
  return [...roles].map(([id, role]) => ({ id, role }))
}

// ADD/REMOVE/BLOCK mang uid; lời mời mang fromUid/toUid nên phải xem bên nào là mình
function getRelationChange(accountId: string, event: FriendEvent): { uid: string; relation: Relation } | undefined {
  switch (event.type) {
    case FriendEventType.ADD:
      return { uid: event.data, relation: 'friend' }
    case FriendEventType.REMOVE:
    case FriendEventType.UNBLOCK:
      return { uid: event.data, relation: 'none' }
    case FriendEventType.BLOCK:
      return { uid: event.data, relation: 'blocked' }
    case FriendEventType.REQUEST:
      return event.data.fromUid === accountId ? { uid: event.data.toUid, relation: 'sent' } : { uid: event.data.fromUid, relation: 'received' }
    case FriendEventType.UNDO_REQUEST:
    case FriendEventType.REJECT_REQUEST:
      return { uid: event.data.fromUid === accountId ? event.data.toUid : event.data.fromUid, relation: 'none' }
  }
}
