import type { Database } from 'bun:sqlite'
import crypto from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inject, injectable } from 'inversify'
import { ThreadType, type DeliveredMessage, type Message, type Reaction, type SeenMessage, type SendMessageQuote, type TMessage, type TReaction, type Typing } from '@hwqnq/zca-js'
import { BadRequestError, broadcast, ConflictError, buildFtsQuery, logger, NotFoundError, buildSearchText } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { readBackup, requireDbCross, type BackupMessage } from '../../../../third-party/db-cross-v4'
import type { SyncControl } from '../../../../third-party/zalo/types'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type { MessageRow, SyncState } from '../../../../types'
import type IContactRepository from '../../../contacts/repositories/interfaces/contact-repository'
import type IContactService from '../../../contacts/services/interfaces/contact-service'
import type IThreadRepository from '../../../threads/repositories/interfaces/thread-repository'
import type {
  ListMessagesRequest,
  ReactRequest,
  SearchMessagesRequest,
  SearchStickersRequest,
  SendMessageRequest,
  SendStickerRequest,
} from '../../dtos/requests/message.request'
import type IMessageRepository from '../../repositories/interfaces/message-repository'
import type IMessageService from '../interfaces/message-service'
import type { Upload } from '../interfaces/message-service'

const BACKFILL_CURSOR_KEYS = { [ThreadType.User]: 'messages.user', [ThreadType.Group]: 'messages.group' }
// Zalo Web chỉ giữ một phần lịch sử gần đây: kéo quá số trang này mà chưa chạm mốc thì chấp nhận thiếu
const BACKFILL_MAX_PAGES = 10

// mark: mọi tin có msgId ≤ mark đã nằm trong DB (null = lần đầu của nick); top: msgId lớn nhất của đợt kéo này
type BackfillState = { mark: bigint | null; top: bigint | null; pages: number }

type StoredMessage = Pick<Message, 'threadId' | 'type' | 'isSelf'> & {
  data: Pick<TMessage, 'msgId' | 'cliMsgId' | 'uidFrom' | 'dName' | 'ts' | 'msgType' | 'content'> & { quote?: { globalMsgId?: unknown } }
}

const SYNC_PC_NAME = 'Zalo PC'
const NOISE_ID_BATCH_SIZE = 500
type SyncSession = { publicKey: string; privateKey: string; state: SyncState }
const SYNC_STATE_KEY = 'backup'
const SYNC_FINAL_STATUSES: SyncState['status'][] = ['completed', 'failed', 'cancelled', 'rejected']
const BACKUP_RECALL_TYPES = new Set(['chat.undo', 'chat.delete'])

// old_messages không tách tin thu hồi ra như event 'message' của zca-js
const isUndoContent = (content: unknown): content is { globalMsgId: string | number } =>
  typeof content === 'object' && content !== null && 'deleteMsg' in content

const getNumericMsgId = (m: Message) => (/^\d+$/.test(m.data.msgId) ? BigInt(m.data.msgId) : null)

const toIntegerId = (value: unknown) => (/^-?\d+$/.test(String(value)) ? String(value) : null)

@injectable()
export default class MessageService implements IMessageService {
  private backfills = new Map<string, BackfillState>()
  private syncs = new Map<string, SyncSession>()

  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.Database) private db: Database,
    @inject(TOKENS.MessageRepository) private messages: IMessageRepository,
    @inject(TOKENS.ThreadRepository) private threads: IThreadRepository,
    @inject(TOKENS.ContactRepository) private contacts: IContactRepository,
    @inject(TOKENS.ContactService) private contactService: IContactService,
  ) {
    zalo.on('message', (id, m) => this.receiveMessages(id, [m]))
    zalo.on('undo', (id, u) => this.markRecalled(id, String(u.data.content.globalMsgId)))
    zalo.on('status', (id, status) => {
      if (status === 'online') this.startBackfill(id)
    })
    zalo.on('old_messages', (id, batch, type) => this.handleOldMessages(id, batch, type))
    zalo.on('reaction', (id, r) => this.receiveReactions(id, [r]))
    zalo.on('old_reactions', (id, batch) => this.receiveReactions(id, batch))
    zalo.on('seen_messages', (id, seens) => this.receiveReceipts(id, seens))
    zalo.on('delivered_messages', (id, delivereds) => this.receiveReceipts(id, delivereds))
    zalo.on('typing', (id, t) => this.onTyping(id, t))
    zalo.on('sync_event', (id, e) => this.onSyncEvent(id, e))
  }

  list(accountId: string, threadId: string, { before, limit }: ListMessagesRequest) {
    const rows = this.messages.list(accountId, threadId, before, limit)
    const reactions = this.messages.reactions(accountId, rows.map((m) => m.msg_id))
    return rows.map((m) => (reactions.has(m.msg_id) ? { ...m, reactions: reactions.get(m.msg_id) } : m))
  }

  search({ q, accountId, limit }: SearchMessagesRequest) {
    const match = buildFtsQuery(q)
    return match ? this.messages.search(match, accountId, limit) : []
  }

  async send(accountId: string, threadId: string, { text, quoteMsgId }: SendMessageRequest, files: Upload[] = []) {
    const type = this.threads.typeOf(accountId, threadId)
    if (type === undefined) throw new NotFoundError('thread not found')
    const quote = quoteMsgId === undefined ? undefined : this.buildQuote(accountId, threadId, quoteMsgId)
    const attachments = files.length
      ? files.map((f) => ({
          data: f.data,
          filename: f.name as `${string}.${string}`,
          metadata: { totalSize: f.data.length, width: f.width, height: f.height },
        }))
      : undefined
    await this.getOnlineApi(accountId).sendMessage({ msg: text, quote, attachments }, threadId, type)
  }

  // Zalo cần đủ các trường của tin gốc (đều có trong raw) để hiện phần trích ở mọi thiết bị
  private buildQuote(accountId: string, threadId: string, msgId: string): SendMessageQuote {
    const message = this.messages.get(accountId, msgId)
    if (!message || message.thread_id !== threadId) throw new NotFoundError('message not found')
    if (message.recalled) throw new BadRequestError('message was recalled', 'MESSAGE_RECALLED')
    const original = JSON.parse(message.raw) as TMessage
    return { content: original.content, msgType: original.msgType, propertyExt: original.propertyExt, uidFrom: original.uidFrom, msgId: original.msgId, cliMsgId: original.cliMsgId, ts: original.ts, ttl: original.ttl }
  }

  async sendSticker(accountId: string, threadId: string, sticker: SendStickerRequest) {
    const type = this.threads.typeOf(accountId, threadId)
    if (type === undefined) throw new NotFoundError('thread not found')
    await this.getOnlineApi(accountId).sendSticker(sticker, threadId, type)
  }

  recentStickers(limit = 30) {
    return this.messages.recentStickers(limit)
  }

  async searchStickers({ accountId, q }: SearchStickersRequest) {
    const found = await this.getOnlineApi(accountId).searchSticker(q.trim(), 40)
    return found.map((s) => ({ id: s.sticker_id, cateId: s.cate_id, type: s.type }))
  }

  async react(accountId: string, threadId: string, msgId: string, { icon }: ReactRequest) {
    const message = this.messages.get(accountId, msgId)
    if (!message || message.thread_id !== threadId) throw new NotFoundError('message not found')
    await this.getOnlineApi(accountId).addReaction(icon, { data: { msgId, cliMsgId: message.cli_msg_id ?? '' }, threadId, type: message.thread_type })
  }

  // old_reactions để content dạng chuỗi JSON
  private receiveReactions(accountId: string, batch: Reaction[]) {
    const changed = new Map<string, string>()
    this.db.transaction(() => {
      for (const reaction of batch) {
        const data = reaction.data
        const content = (typeof data.content === 'string' ? JSON.parse(data.content) : data.content) as TReaction['content']
        for (const target of content.rMsg) {
          const msgId = String(target.gMsgID)
          const row = { account_id: accountId, msg_id: msgId, id: String(data.msgId), user_id: data.uidFrom, icon: content.rIcon, ts: Number(data.ts) }
          if (this.messages.react(row)) changed.set(msgId, reaction.threadId)
        }
      }
    })()
    for (const [msgId, threadId] of changed) {
      broadcast({ type: 'reaction', accountId, threadId, msgId, reactions: this.messages.reactions(accountId, [msgId]).get(msgId) ?? [] })
    }
  }

  receipts(accountId: string, threadId: string) {
    return this.messages.receipts(accountId, threadId)
  }

  // Zalo báo "đã nhận / đã xem tới tin X"; tuỳ loại sự kiện X nằm ở msgId hoặc realMsgId nên lấy cái có trong DB.
  // Chưa có tin X thì bỏ qua: không biết X đứng đâu so với các tin khác
  private receiveReceipts(accountId: string, events: (SeenMessage | DeliveredMessage)[]) {
    const changed = new Set<string>()
    this.db.transaction(() => {
      for (const e of events) {
        const ids = [e.data.msgId, 'realMsgId' in e.data ? e.data.realMsgId : undefined]
        const message = ids.map((id) => (id ? this.messages.get(accountId, String(id)) : undefined)).find((m) => m?.thread_id === e.threadId)
        if (!message) continue
        const delivered = 'deliveredUids' in e.data ? e.data.deliveredUids : []
        // Tin riêng: người xem chính là người kia (threadId)
        const seen = 'seenUids' in e.data ? e.data.seenUids : [e.threadId]
        for (const [uids, isSeen] of [[delivered, false], [seen, true]] as const)
          for (const uid of uids)
            if (uid !== accountId && this.messages.receipt(accountId, e.threadId, uid, Number(message.msg_id), isSeen)) changed.add(e.threadId)
      }
    })()
    for (const threadId of changed) broadcast({ type: 'receipt', accountId, threadId })
  }

  // Không lưu: chỉ chuyển tiếp cho client hiện "đang soạn tin"
  private onTyping(accountId: string, typing: Typing) {
    const userId = typing.data.uid
    if (userId === accountId) return
    broadcast({ type: 'typing', accountId, threadId: typing.threadId, userId, name: this.threads.profile(accountId, userId)?.name ?? null })
  }

  async recall(accountId: string, threadId: string, msgId: string) {
    const message = this.messages.get(accountId, msgId)
    if (!message || message.thread_id !== threadId) throw new NotFoundError('message not found')
    if (!message.is_self) throw new BadRequestError('can only recall own messages', 'NOT_OWN_MESSAGE')
    await this.getOnlineApi(accountId).undo({ msgId, cliMsgId: message.cli_msg_id ?? '' }, threadId, message.thread_type)
  }

  private getOnlineApi(accountId: string) {
    const api = this.zalo.getApi(accountId)
    if (!api) throw new ConflictError('account offline', 'ACCOUNT_OFFLINE')
    return api
  }

  // Cả lô trong một transaction, broadcast sau khi commit. Trả về số tin mới
  private receiveMessages(accountId: string, batch: Message[], read = false) {
    const newMessages = this.db.transaction(() => batch.flatMap((m) => this.storeMessage(accountId, m, read) ?? []))()
    for (const message of newMessages) broadcast({ type: 'message', message })
    return newMessages.length
  }

  private storeMessage(accountId: string, message: StoredMessage, read: boolean): MessageRow | undefined {
    const data = message.data
    const msgId = toIntegerId(data.msgId)
    if (msgId === null) return
    const row: Omit<MessageRow, 'id' | 'reactions' | 'from_avatar'> = {
      account_id: accountId,
      msg_id: msgId,
      cli_msg_id: toIntegerId(data.cliMsgId),
      quote_msg_id: toIntegerId(data.quote?.globalMsgId),
      thread_id: message.threadId,
      thread_type: message.type,
      from_id: data.uidFrom,
      from_name: data.dName || null,
      is_self: message.isSelf ? 1 : 0,
      ts: Number(data.ts),
      msg_type: data.msgType,
      text: typeof data.content === 'string' ? data.content : null,
      raw: JSON.stringify(data),
      recalled: 0,
    }
    this.threads.ensure(accountId, message.threadId, message.type)
    const id = this.messages.insert(row)
    if (id === undefined) return
    this.threads.advance({ accountId, id: message.threadId, msgId: row.msg_id, ts: row.ts, read: read || message.isSelf })
    const body = buildSearchText(row.text, data.content)
    if (body) this.messages.index(id, body)
    if (message.type === ThreadType.User) {
      this.contacts.ensureUser(accountId, message.threadId, message.isSelf ? null : row.from_name)
      this.contacts.link(accountId, message.threadId)
    } else {
      this.contacts.ensureGroup(accountId, message.threadId)
      if (!message.isSelf) this.contacts.ensureUser(accountId, row.from_id, row.from_name)
    }
    return { id, ...row }
  }

  private markRecalled(accountId: string, msgId: string) {
    if (this.messages.recall(accountId, msgId)) broadcast({ type: 'undo', accountId, msgId })
  }

  // Listener có thể rơi tin khi tắt app hoặc rớt mạng: mỗi lần kết nối, kéo từ mới nhất về tới mốc đã có.
  // Cảm xúc chỉ xin một trang mới nhất: tắt app lâu mà có nhiều cảm xúc thì có thể thiếu
  private startBackfill(accountId: string) {
    for (const type of [ThreadType.User, ThreadType.Group]) {
      const mark = this.messages.cursor(accountId, BACKFILL_CURSOR_KEYS[type])
      this.backfills.set(`${accountId}:${type}`, { mark: mark === undefined ? null : BigInt(mark), top: null, pages: 0 })
      this.zalo.requestOldMessages(accountId, type, null)
      this.zalo.requestOldReactions(accountId, type, null)
    }
  }

  private handleOldMessages(accountId: string, batch: Message[], type: ThreadType) {
    for (const m of batch) if (isUndoContent(m.data.content)) this.markRecalled(accountId, String(m.data.content.globalMsgId))
    const regularMessages = batch.filter((m) => !isUndoContent(m.data.content))
    const key = `${accountId}:${type}`
    const backfill = this.backfills.get(key)
    // Lần đầu của nick: lịch sử kéo về coi như đã đọc
    const added = this.receiveMessages(accountId, regularMessages, backfill?.mark === null)
    if (!backfill) return

    const ids = regularMessages.map(getNumericMsgId).filter((id): id is bigint => id !== null)
    for (const id of ids) if (backfill.top === null || id > backfill.top) backfill.top = id
    backfill.pages++
    const mark = backfill.mark
    const reached = mark === null || added === 0 || ids.length === 0 || ids.some((id) => id <= mark)
    if (!reached && backfill.pages < BACKFILL_MAX_PAGES) {
      const oldest = ids.reduce((a, b) => (b < a ? b : a))
      return this.zalo.requestOldMessages(accountId, type, String(oldest))
    }
    if (!reached) logger.warn('backfill stopped at page limit, some messages may be missing', { accountId, type })
    const next = backfill.top !== null && (mark === null || backfill.top > mark) ? backfill.top : mark
    if (next !== null) this.messages.setCursor(accountId, BACKFILL_CURSOR_KEYS[type], String(next))
    this.backfills.delete(key)
  }

  async requestSync(accountId: string) {
    requireDbCross()
    this.getOnlineApi(accountId)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    const session: SyncSession = { publicKey: publicKey.toString('base64'), privateKey, state: { status: 'requested' } }
    await this.zalo.syncMessages(accountId, 'pull_mobile_msg', { pc_name: SYNC_PC_NAME, public_key: session.publicKey, from_seq_id: 0, is_retry: 0, min_seq_id: 0, temp_key: '' })
    this.syncs.set(accountId, session)
    this.setSyncState(accountId, session, session.state)
    return session.state
  }

  async cancelSync(accountId: string) {
    const session = this.syncs.get(accountId)
    if (!session) return
    await this.zalo
      .syncMessages(accountId, 'cancel_pull_mobile_msg', { pc_name: SYNC_PC_NAME, public_key: session.publicKey })
      .catch((err) => logger.error('cancel sync', { accountId, err }))
    this.setSyncState(accountId, session, { status: 'cancelled' })
  }

  syncState(accountId: string): SyncState {
    const stored = this.messages.cursor(accountId, SYNC_STATE_KEY)
    return this.syncs.get(accountId)?.state ?? (stored ? (JSON.parse(stored) as SyncState) : { status: 'idle' })
  }

  private setSyncState(accountId: string, session: SyncSession, state: SyncState) {
    session.state = state
    if (this.syncs.get(accountId) !== session) return
    if (SYNC_FINAL_STATUSES.includes(state.status)) this.messages.setCursor(accountId, SYNC_STATE_KEY, JSON.stringify(state))
    broadcast({ type: 'sync_status', accountId, ...state })
  }

  private onSyncEvent(accountId: string, { act, data }: SyncControl) {
    const session = this.syncs.get(accountId)
    if (!session) return
    const info = (typeof data === 'string' ? JSON.parse(data) : (data ?? {})) as Record<string, unknown>
    if (act === 'user_confirm') {
      const action = Number(info.user_action)
      if (action === 1 || action === 3) this.setSyncState(accountId, session, { status: 'confirmed' })
      else if (action === 0) this.setSyncState(accountId, session, { status: 'rejected' })
    } else if (act === 'syncmsg_info') {
      this.importBackup(accountId, session, String(info.url), String(info.encrypted_key)).catch((err) => {
        logger.error('import sync backup', { accountId, err })
        this.setSyncState(accountId, session, { status: 'failed', error: err instanceof Error ? err.message : String(err) })
      })
    } else if (act === 'transfer_error' && Number(info.error_code)) {
      this.setSyncState(accountId, session, { status: 'failed', error: `transfer_error ${info.error_code}` })
    }
  }

  private async importBackup(accountId: string, session: SyncSession, url: string, encryptedKey: string) {
    this.setSyncState(accountId, session, { status: 'importing' })
    const file = join(tmpdir(), `zalo-backup-${crypto.randomUUID()}`)
    let backup: BackupMessage[]
    try {
      await Bun.write(file, await this.zalo.download(accountId, url))
      backup = readBackup(file, session.privateKey, encryptedKey)
    } finally {
      rmSync(file, { force: true })
    }
    const fids = await this.toNoiseIds(accountId, 'fids', backup.flatMap((m) => (m.isGroup ? [m.data.uidFrom] : [m.threadId, m.data.uidFrom])))
    const gids = await this.toNoiseIds(accountId, 'gids', backup.flatMap((m) => (m.isGroup ? [m.threadId] : [])))
    // ponytail: một transaction chặn server ~6s với 50k tin; chia lô và nhường event loop nếu thấy giật (nhất là khi đang gọi)
    const imported = this.db.transaction(() =>
      backup.filter(({ threadId, isGroup, data }) => {
        const uidFrom = fids.get(data.uidFrom) ?? data.uidFrom
        const type = isGroup ? ThreadType.Group : ThreadType.User
        const stored = this.storeMessage(accountId, { threadId: (isGroup ? gids : fids).get(threadId) ?? threadId, type, isSelf: uidFrom === accountId, data: { ...data, uidFrom } }, true)
        if (BACKUP_RECALL_TYPES.has(data.msgType)) this.markRecalled(accountId, data.msgId)
        return stored
      }).length,
    )()
    this.setSyncState(accountId, session, { status: 'completed', imported })
    broadcast({ type: 'threads', accountId })
    this.contactService.scheduleProfileRefresh(accountId)
  }

  // Bản sao lưu từ điện thoại dùng uid/groupId thật, còn Zalo Web dùng id riêng theo từng nick
  private async toNoiseIds(accountId: string, kind: 'fids' | 'gids', plainIds: string[]) {
    const ids = new Map<string, string>()
    const plain = [...new Set(plainIds)].filter((id) => Number.isSafeInteger(Number(id)))
    for (let i = 0; i < plain.length; i += NOISE_ID_BATCH_SIZE) {
      const batch = plain.slice(i, i + NOISE_ID_BATCH_SIZE)
      const noise = (await this.zalo.noiseIds(accountId, { [kind]: batch.map(Number) }))[kind] ?? []
      batch.forEach((id, j) => {
        if (noise[j]) ids.set(id, noise[j].replace(/^g/, ''))
      })
    }
    return ids
  }
}
