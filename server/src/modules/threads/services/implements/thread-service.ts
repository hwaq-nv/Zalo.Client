import { inject, injectable } from 'inversify'
import { ThreadType } from '@hwqnq/zca-js'
import { BadRequestError, ConflictError, normalizePhone, NotFoundError } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type IContactRepository from '../../../contacts/repositories/interfaces/contact-repository'
import type { FindByPhoneRequest } from '../../dtos/requests/thread.request'
import type IThreadRepository from '../../repositories/interfaces/thread-repository'
import type IThreadService from '../interfaces/thread-service'

const ONLINE_WINDOW_MS = 6 * 60_000

@injectable()
export default class ThreadService implements IThreadService {
  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.ThreadRepository) private threads: IThreadRepository,
    @inject(TOKENS.ContactRepository) private contactRepo: IContactRepository,
  ) {}

  list(accountId?: string) {
    return this.threads.list(accountId)
  }

  contacts(accountId: string) {
    return this.threads.contacts(accountId)
  }

  get(accountId: string, id: string) {
    const row = this.threads.get(accountId, id)
    if (!row) throw new NotFoundError('thread not found')
    return row
  }

  async findByPhone({ accountId, phone }: FindByPhoneRequest) {
    const normalized = normalizePhone(phone)
    if (!normalized) throw new BadRequestError('invalid phone', 'INVALID_PHONE')
    const known = this.contactRepo.userByPhone(accountId, normalized)
    if (known) return this.get(accountId, known)
    const api = this.zalo.getApi(accountId)
    if (!api) throw new ConflictError('account offline', 'ACCOUNT_OFFLINE')
    const user = await api.findUser(normalized)
    if (!user?.uid) throw new NotFoundError('no Zalo user with this phone', 'USER_NOT_FOUND')
    const displayName = user.display_name || null
    this.contactRepo.ensureUser(accountId, user.uid, displayName)
    this.contactRepo.saveProfiles(accountId, [user.uid], [{ id: user.uid, displayName, zaloName: user.zalo_name || null, avatar: user.avatar || null, phone: normalized }])
    return this.get(accountId, user.uid)
  }

  markRead(accountId: string, id: string) {
    if (!this.threads.markRead(accountId, id)) throw new NotFoundError('thread not found')
  }

  async presence(accountId: string, userId: string) {
    if (this.threads.typeOf(accountId, userId) !== ThreadType.User) throw new BadRequestError('presence is only for user threads', 'NOT_USER_THREAD')
    const api = this.zalo.getApi(accountId)
    if (!api) throw new ConflictError('account offline', 'ACCOUNT_OFFLINE')
    const { settings, lastOnline } = await api.lastOnline(userId)
    if (!settings.show_online_status || !lastOnline) return { online: null, lastOnline: null }
    return { online: Date.now() - lastOnline < ONLINE_WINDOW_MS, lastOnline }
  }
}
