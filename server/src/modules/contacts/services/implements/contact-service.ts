import { inject, injectable } from 'inversify'
import { FriendEventType, ThreadType, type API, type FriendEvent, type GroupEvent } from 'zca-js'
import { BadRequestError, broadcast, ConflictError, logger, normalizePhone, NotFoundError } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type { Relation } from '../../../../types'
import type IContactRepository from '../../repositories/interfaces/contact-repository'
import type { UpdateContactRequest } from '../../dtos/requests/contact.request'
import type IContactService from '../interfaces/contact-service'

const GROUP_INFO_BATCH = 50
const ALIAS_PAGE = 100
const ALIAS_MAX_PAGES = 100
// Version chỉ là tối ưu: quá hạn này thì đồng bộ đủ, phòng khi hiểu sai nghĩa version của Zalo
const FULL_SYNC_AFTER = 24 * 60 * 60 * 1000
const REGROUP_DELAY = 2000
const PROFILE_BATCH = 100
// Gom tin riêng đến dồn dập (nhất là lúc kéo bù tin) thành một lần gọi getUserInfo
const PROFILE_DELAY = 500

@injectable()
export default class ContactService implements IContactService {
  private regroup = new Map<string, ReturnType<typeof setTimeout>>()
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
      if (m.type === ThreadType.User && !m.isSelf) this.scheduleProfiles(id)
    })
    zalo.on('old_messages', (id, _batch, type) => {
      if (type === ThreadType.User) this.scheduleProfiles(id)
    })
  }

  async sync(accountId: string, api: API) {
    const ver = api.getContext().extraVer
    await this.unlessUnchanged(accountId, 'friends', ver?.friend, async () => {
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
    await this.unlessUnchanged(accountId, 'aliases', ver?.alias, async () => {
      const items = []
      for (let page = 1; page <= ALIAS_MAX_PAGES; page++) {
        const { items: batch } = await api.getAliasList(ALIAS_PAGE, page)
        items.push(...batch)
        if (batch.length < ALIAS_PAGE) break
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

  private async unlessUnchanged(accountId: string, key: string, version: string | undefined, run: () => Promise<void>) {
    const last = this.contacts.version(accountId, key)
    if (version && last?.value === version && Date.now() - last.synced_at < FULL_SYNC_AFTER) return
    await run()
    if (version) this.contacts.setVersion(accountId, key, version)
  }

  // getAllGroups trả version từng nhóm: chỉ gọi getGroupInfo cho nhóm mới, nhóm đã đổi, hoặc nhóm vừa có sự kiện
  private async syncGroups(accountId: string, api: API) {
    const { gridVerMap } = await api.getAllGroups()
    const known = this.contacts.groupVersions(accountId)
    const changed = Object.keys(gridVerMap).filter((id) => {
      const g = known.get(id)
      return !g?.isMember || g.version !== gridVerMap[id]
    })
    for (let i = 0; i < changed.length; i += GROUP_INFO_BATCH) {
      const ids = changed.slice(i, i + GROUP_INFO_BATCH)
      const { gridInfoMap } = await api.getGroupInfo(ids)
      this.contacts.upsertGroups(
        accountId,
        ids.map((id) => {
          const g = gridInfoMap[id]
          return { id, name: g?.name ?? null, avatar: g?.avt || g?.fullAvt || null, version: gridVerMap[id] }
        }),
      )
    }
    this.contacts.leaveGroups(accountId, Object.keys(gridVerMap))
  }

  // Người lạ chỉ có tên lấy từ tin nhắn: hỏi Zalo tên và ảnh theo lô. saveProfiles đánh dấu cả lô đã hỏi nên vòng lặp luôn dừng
  private async refreshProfiles(accountId: string, api: API) {
    let changed = false
    for (let ids = this.contacts.missingProfiles(accountId, PROFILE_BATCH); ids.length; ids = this.contacts.missingProfiles(accountId, PROFILE_BATCH)) {
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

  private scheduleProfiles(accountId: string) {
    if (this.profileTimers.has(accountId)) return
    this.profileTimers.set(
      accountId,
      setTimeout(() => {
        this.profileTimers.delete(accountId)
        const api = this.zalo.get(accountId)
        if (!api) return
        this.refreshProfiles(accountId, api)
          .then((changed) => changed && broadcast({ type: 'threads', accountId }))
          .catch((err) => logger.error('fetch profiles', { accountId, err }))
      }, PROFILE_DELAY),
    )
  }

  private onFriendEvent(accountId: string, e: FriendEvent) {
    const change = relationChange(accountId, e)
    if (!change) return
    this.contacts.setRelation(accountId, change.uid, change.relation)
    this.contacts.link(accountId, change.uid)
  }

  // Sự kiện nhóm chỉ là tín hiệu "nhóm này vừa đổi": lấy lại info theo version thay vì đọc từng loại sự kiện
  private onGroupEvent(accountId: string, e: GroupEvent) {
    this.contacts.invalidateGroup(accountId, e.threadId)
    clearTimeout(this.regroup.get(accountId))
    this.regroup.set(
      accountId,
      setTimeout(() => {
        this.regroup.delete(accountId)
        const api = this.zalo.get(accountId)
        if (!api) return
        this.syncGroups(accountId, api)
          .then(() => broadcast({ type: 'threads', accountId }))
          .catch((err) => logger.error('sync groups', { accountId, err }))
      }, REGROUP_DELAY),
    )
  }
}

// ADD/REMOVE/BLOCK mang uid; lời mời mang fromUid/toUid nên phải xem bên nào là mình
function relationChange(accountId: string, e: FriendEvent): { uid: string; relation: Relation } | undefined {
  switch (e.type) {
    case FriendEventType.ADD:
      return { uid: e.data, relation: 'friend' }
    case FriendEventType.REMOVE:
    case FriendEventType.UNBLOCK:
      return { uid: e.data, relation: 'none' }
    case FriendEventType.BLOCK:
      return { uid: e.data, relation: 'blocked' }
    case FriendEventType.REQUEST:
      return e.data.fromUid === accountId ? { uid: e.data.toUid, relation: 'sent' } : { uid: e.data.fromUid, relation: 'received' }
    case FriendEventType.UNDO_REQUEST:
    case FriendEventType.REJECT_REQUEST:
      return { uid: e.data.fromUid === accountId ? e.data.toUid : e.data.fromUid, relation: 'none' }
  }
}
