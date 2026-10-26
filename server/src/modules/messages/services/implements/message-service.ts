import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import { ThreadType, type Message, type Reaction, type SendMessageQuote, type TMessage, type TReaction } from 'zca-js'
import { BadRequestError, broadcast, ConflictError, buildFtsQuery, logger, NotFoundError, buildSearchText } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type { MessageRow } from '../../../../types'
import type IContactRepository from '../../../contacts/repositories/interfaces/contact-repository'
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

// old_messages không tách tin thu hồi ra như event 'message' của zca-js
const isUndoContent = (content: unknown): content is { globalMsgId: string | number } =>
  typeof content === 'object' && content !== null && 'deleteMsg' in content

const getNumericMsgId = (m: Message) => (/^\d+$/.test(m.data.msgId) ? BigInt(m.data.msgId) : null)

@injectable()
export default class MessageService implements IMessageService {
  private backfills = new Map<string, BackfillState>()

  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.Database) private db: Database,
    @inject(TOKENS.MessageRepository) private messages: IMessageRepository,
    @inject(TOKENS.ThreadRepository) private threads: IThreadRepository,
    @inject(TOKENS.ContactRepository) private contacts: IContactRepository,
  ) {
    zalo.on('message', (id, m) => this.receiveMessages(id, [m]))
    zalo.on('undo', (id, u) => this.markRecalled(id, String(u.data.content.globalMsgId)))
    zalo.on('status', (id, status) => {
      if (status === 'online') this.startBackfill(id)
    })
    zalo.on('old_messages', (id, batch, type) => this.handleOldMessages(id, batch, type))
    zalo.on('reaction', (id, r) => this.receiveReactions(id, [r]))
    zalo.on('old_reactions', (id, batch) => this.receiveReactions(id, batch))
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
    const { cliMsgId } = JSON.parse(message.raw) as TMessage
    await this.getOnlineApi(accountId).addReaction(icon, { data: { msgId, cliMsgId }, threadId, type: message.thread_type })
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

  async recall(accountId: string, threadId: string, msgId: string) {
    const message = this.messages.get(accountId, msgId)
    if (!message || message.thread_id !== threadId) throw new NotFoundError('message not found')
    if (!message.is_self) throw new BadRequestError('can only recall own messages', 'NOT_OWN_MESSAGE')
    const { cliMsgId } = JSON.parse(message.raw) as TMessage
    await this.getOnlineApi(accountId).undo({ msgId, cliMsgId }, threadId, message.thread_type)
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

  private storeMessage(accountId: string, message: Message, read: boolean): MessageRow | undefined {
    const data = message.data
    const row: Omit<MessageRow, 'id' | 'reactions'> = {
      account_id: accountId,
      msg_id: data.msgId,
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
}
