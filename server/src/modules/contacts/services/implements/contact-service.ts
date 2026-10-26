import { inject, injectable } from 'inversify'
import { FriendEventType, ThreadType, type API, type FriendEvent, type GroupEvent } from 'zca-js'
import { BadRequestError, broadcast, ConflictError, logger, normalizePhone, NotFoundError } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type { Relation } from '../../../../types'
import type IContactRepository from '../../repositories/interfaces/contact-repository'
import type { UpdateContactRequest } from '../../dtos/requests/contact.request'
import type IContactService from '../interfaces/contact-service'

const GROUP_INFO_BATCH_SIZE = 50
const ALIAS_PAGE_SIZE = 100
const ALIAS_MAX_PAGES = 100
// Version chỉ là tối ưu: quá hạn này thì đồng bộ đủ, phòng khi hiểu sai nghĩa version của Zalo
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const GROUP_RESYNC_DELAY_MS = 2000
const PROFILE_BATCH_SIZE = 100
// Gom tin riêng đến dồn dập (nhất là lúc kéo bù tin) thành một lần gọi getUserInfo
const PROFILE_FETCH_DELAY_MS = 500

@injectable()
export default class ContactService implements IContactService {
  private groupSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private profileTimers = new Map<string, ReturnType<typeof setTimeout>>()

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
      if (m.type === ThreadType.User && !m.isSelf) this.scheduleProfileRefresh(id)
    })
    zalo.on('old_messages', (id, _batch, type) => {
      if (type === ThreadType.User) this.scheduleProfileRefresh(id)
    })
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
    await this.refreshProfiles(accountId, api)
    broadcast({ type: 'threads', accountId })
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
          return { id, name: group?.name ?? null, avatar: group?.avt || group?.fullAvt || null, version: gridVerMap[id] }
        }),
      )
    }
    this.contacts.leaveGroups(accountId, Object.keys(gridVerMap))
  }

  // Người lạ chỉ có tên lấy từ tin nhắn: hỏi Zalo tên và ảnh theo lô. saveProfiles đánh dấu cả lô đã hỏi nên vòng lặp luôn dừng
  private async refreshProfiles(accountId: string, api: API) {
    let changed = false
    for (let ids = this.contacts.missingProfiles(accountId, PROFILE_BATCH_SIZE); ids.length; ids = this.contacts.missingProfiles(accountId, PROFILE_BATCH_SIZE)) {
      const { changed_profiles } = await api.getUserInfo(ids)
      this.contacts.saveProfiles(
        accountId,
        ids,
        Object.values(changed_profiles).map((p) => ({ id: p.userId, displayName: p.displayName || null, zaloName: p.zaloName || null, avatar: p.avatar || null })),
      )
      changed = true
    }
    return changed
  }

  private scheduleProfileRefresh(accountId: string) {
    if (this.profileTimers.has(accountId)) return
    this.profileTimers.set(
      accountId,
      setTimeout(() => {
        this.profileTimers.delete(accountId)
        const api = this.zalo.getApi(accountId)
        if (!api) return
        this.refreshProfiles(accountId, api)
          .then((changed) => changed && broadcast({ type: 'threads', accountId }))
          .catch((err) => logger.error('fetch profiles', { accountId, err }))
      }, PROFILE_FETCH_DELAY_MS),
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
