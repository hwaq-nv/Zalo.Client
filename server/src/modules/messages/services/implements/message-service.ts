import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import { ThreadType, type Message, type Reaction, type SendMessageQuote, type TMessage, type TReaction } from 'zca-js'
import { BadRequestError, broadcast, ConflictError, ftsQuery, logger, NotFoundError, searchBody } from '../../../../core'
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

const CURSOR = { [ThreadType.User]: 'messages.user', [ThreadType.Group]: 'messages.group' }
// Zalo Web chỉ giữ một phần lịch sử gần đây: kéo quá số trang này mà chưa chạm mốc thì chấp nhận thiếu
const BACKFILL_MAX_PAGES = 10

// mark: mọi tin có msgId ≤ mark đã nằm trong DB (null = lần đầu của nick); top: msgId lớn nhất của đợt kéo này
type Backfill = { mark: bigint | null; top: bigint | null; pages: number }

// old_messages không tách tin thu hồi ra như event 'message' của zca-js
const isUndo = (content: unknown): content is { globalMsgId: string | number } =>
  typeof content === 'object' && content !== null && 'deleteMsg' in content

const msgIdOf = (m: Message) => (/^\d+$/.test(m.data.msgId) ? BigInt(m.data.msgId) : null)

@injectable()
export default class MessageService implements IMessageService {
  private backfills = new Map<string, Backfill>()

  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.Database) private db: Database,
    @inject(TOKENS.MessageRepository) private messages: IMessageRepository,
    @inject(TOKENS.ThreadRepository) private threads: IThreadRepository,
    @inject(TOKENS.ContactRepository) private contacts: IContactRepository,
  ) {
    zalo.on('message', (id, m) => this.receive(id, [m]))
    zalo.on('undo', (id, u) => this.markRecalled(id, String(u.data.content.globalMsgId)))
    zalo.on('status', (id, status) => {
      if (status === 'online') this.startBackfill(id)
    })
    zalo.on('old_messages', (id, batch, type) => this.onOldMessages(id, batch, type))
    zalo.on('reaction', (id, r) => this.receiveReactions(id, [r]))
    zalo.on('old_reactions', (id, batch) => this.receiveReactions(id, batch))
  }

  list(accountId: string, threadId: string, { before, limit }: ListMessagesRequest) {
    const rows = this.messages.list(accountId, threadId, before, limit)
    const reactions = this.messages.reactions(accountId, rows.map((m) => m.msg_id))
    return rows.map((m) => (reactions.has(m.msg_id) ? { ...m, reactions: reactions.get(m.msg_id) } : m))
  }

  search({ q, accountId, limit }: SearchMessagesRequest) {
    const match = ftsQuery(q)
    return match ? this.messages.search(match, accountId, limit) : []
  }

  async send(accountId: string, threadId: string, { text, quoteMsgId }: SendMessageRequest, files: Upload[] = []) {
    const type = this.threads.typeOf(accountId, threadId)
    if (type === undefined) throw new NotFoundError('thread not found')
    const quote = quoteMsgId === undefined ? undefined : this.quoteOf(accountId, threadId, quoteMsgId)
    const attachments = files.length
      ? files.map((f) => ({
          data: f.data,
          filename: f.name as `${string}.${string}`,
          metadata: { totalSize: f.data.length, width: f.width, height: f.height },
        }))
      : undefined
    await this.session(accountId).sendMessage({ msg: text, quote, attachments }, threadId, type)
  }

  // Zalo cần đủ các trường của tin gốc (đều có trong raw) để hiện phần trích ở mọi thiết bị
  private quoteOf(accountId: string, threadId: string, msgId: string): SendMessageQuote {
    const m = this.messages.get(accountId, msgId)
    if (!m || m.thread_id !== threadId) throw new NotFoundError('message not found')
    if (m.recalled) throw new BadRequestError('message was recalled', 'MESSAGE_RECALLED')
    const d = JSON.parse(m.raw) as TMessage
    return { content: d.content, msgType: d.msgType, propertyExt: d.propertyExt, uidFrom: d.uidFrom, msgId: d.msgId, cliMsgId: d.cliMsgId, ts: d.ts, ttl: d.ttl }
  }

  async sendSticker(accountId: string, threadId: string, sticker: SendStickerRequest) {
    const type = this.threads.typeOf(accountId, threadId)
    if (type === undefined) throw new NotFoundError('thread not found')
    await this.session(accountId).sendSticker(sticker, threadId, type)
  }

  recentStickers(limit = 30) {
    return this.messages.recentStickers(limit)
  }

  async searchStickers({ accountId, q }: SearchStickersRequest) {
    const found = await this.session(accountId).searchSticker(q.trim(), 40)
    return found.map((s) => ({ id: s.sticker_id, cateId: s.cate_id, type: s.type }))
  }

  async react(accountId: string, threadId: string, msgId: string, { icon }: ReactRequest) {
    const m = this.messages.get(accountId, msgId)
    if (!m || m.thread_id !== threadId) throw new NotFoundError('message not found')
    const { cliMsgId } = JSON.parse(m.raw) as TMessage
    await this.session(accountId).addReaction(icon, { data: { msgId, cliMsgId }, threadId, type: m.thread_type })
  }

  // old_reactions để content dạng chuỗi JSON
  private receiveReactions(accountId: string, batch: Reaction[]) {
    const changed = new Map<string, string>()
    this.db.transaction(() => {
      for (const r of batch) {
        const d = r.data
        const c = (typeof d.content === 'string' ? JSON.parse(d.content) : d.content) as TReaction['content']
        for (const t of c.rMsg) {
          const msgId = String(t.gMsgID)
          const row = { account_id: accountId, msg_id: msgId, id: String(d.msgId), user_id: d.uidFrom, icon: c.rIcon, ts: Number(d.ts) }
          if (this.messages.react(row)) changed.set(msgId, r.threadId)
        }
      }
    })()
    for (const [msgId, threadId] of changed) {
      broadcast({ type: 'reaction', accountId, threadId, msgId, reactions: this.messages.reactions(accountId, [msgId]).get(msgId) ?? [] })
    }
  }

  async recall(accountId: string, threadId: string, msgId: string) {
    const m = this.messages.get(accountId, msgId)
    if (!m || m.thread_id !== threadId) throw new NotFoundError('message not found')
    if (!m.is_self) throw new BadRequestError('can only recall own messages', 'NOT_OWN_MESSAGE')
    const { cliMsgId } = JSON.parse(m.raw) as TMessage
    await this.session(accountId).undo({ msgId, cliMsgId }, threadId, m.thread_type)
  }

  private session(accountId: string) {
    const api = this.zalo.get(accountId)
    if (!api) throw new ConflictError('account offline', 'ACCOUNT_OFFLINE')
    return api
  }

  // Cả lô trong một transaction, broadcast sau khi commit. Trả về số tin mới
  private receive(accountId: string, batch: Message[], read = false) {
    const fresh = this.db.transaction(() => batch.flatMap((m) => this.store(accountId, m, read) ?? []))()
    for (const message of fresh) broadcast({ type: 'message', message })
    return fresh.length
  }

  private store(accountId: string, m: Message, read: boolean): MessageRow | undefined {
    const d = m.data
    const row: Omit<MessageRow, 'id' | 'reactions'> = {
      account_id: accountId,
      msg_id: d.msgId,
      thread_id: m.threadId,
      thread_type: m.type,
      from_id: d.uidFrom,
      from_name: d.dName || null,
      is_self: m.isSelf ? 1 : 0,
      ts: Number(d.ts),
      msg_type: d.msgType,
      text: typeof d.content === 'string' ? d.content : null,
      raw: JSON.stringify(d),
      recalled: 0,
    }
    this.threads.ensure(accountId, m.threadId, m.type)
    const id = this.messages.insert(row)
    if (id === undefined) return
    this.threads.advance({ accountId, id: m.threadId, msgId: row.msg_id, ts: row.ts, read: read || m.isSelf })
    const body = searchBody(row.text, d.content)
    if (body) this.messages.index(id, body)
    if (m.type === ThreadType.User) {
      this.contacts.ensureUser(accountId, m.threadId, m.isSelf ? null : row.from_name)
      this.contacts.link(accountId, m.threadId)
    } else {
      this.contacts.ensureGroup(accountId, m.threadId)
      if (!m.isSelf) this.contacts.ensureUser(accountId, row.from_id, row.from_name)
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
      const mark = this.messages.cursor(accountId, CURSOR[type])
      this.backfills.set(`${accountId}:${type}`, { mark: mark === undefined ? null : BigInt(mark), top: null, pages: 0 })
      this.zalo.requestOldMessages(accountId, type, null)
      this.zalo.requestOldReactions(accountId, type, null)
    }
  }

  private onOldMessages(accountId: string, batch: Message[], type: ThreadType) {
    for (const m of batch) if (isUndo(m.data.content)) this.markRecalled(accountId, String(m.data.content.globalMsgId))
    const msgs = batch.filter((m) => !isUndo(m.data.content))
    const key = `${accountId}:${type}`
    const st = this.backfills.get(key)
    // Lần đầu của nick: lịch sử kéo về coi như đã đọc
    const added = this.receive(accountId, msgs, st?.mark === null)
    if (!st) return

    const ids = msgs.map(msgIdOf).filter((id): id is bigint => id !== null)
    for (const id of ids) if (st.top === null || id > st.top) st.top = id
    st.pages++
    const mark = st.mark
    const reached = mark === null || added === 0 || ids.length === 0 || ids.some((id) => id <= mark)
    if (!reached && st.pages < BACKFILL_MAX_PAGES) {
      const oldest = ids.reduce((a, b) => (b < a ? b : a))
      return this.zalo.requestOldMessages(accountId, type, String(oldest))
    }
    if (!reached) logger.warn('backfill stopped at page limit, some messages may be missing', { accountId, type })
    const next = st.top !== null && (mark === null || st.top > mark) ? st.top : mark
    if (next !== null) this.messages.setCursor(accountId, CURSOR[type], String(next))
    this.backfills.delete(key)
  }
}
