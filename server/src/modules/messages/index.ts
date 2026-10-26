import { Hono } from 'hono'
import { z } from 'zod'
import { docs, ok, validate } from '../../core'
import {
  ListMessagesRequest,
  ReactRequest,
  SearchMessagesRequest,
  SearchStickersRequest,
  SendAttachmentsRequest,
  SendMessageRequest,
  SendStickerRequest,
} from './dtos/requests/message.request'
import { MessageRow, Sticker } from './dtos/responses/message.response'
import type IMessageService from './services/interfaces/message-service'

export const messageRoutes = (messages: IMessageService) =>
  new Hono()
    .get('/search', docs('messages', z.array(MessageRow)), validate('query', SearchMessagesRequest), (c) => ok(c, messages.search(c.req.valid('query'))))
    .get('/stickers/recent', docs('messages', z.array(Sticker)), (c) => ok(c, messages.recentStickers()))
    .get('/stickers/search', docs('messages', z.array(Sticker)), validate('query', SearchStickersRequest), async (c) =>
      ok(c, await messages.searchStickers(c.req.valid('query'))),
    )
    .get('/:accountId/:threadId/messages', docs('messages', z.array(MessageRow)), validate('query', ListMessagesRequest), (c) => {
      const { accountId, threadId } = c.req.param()
      return ok(c, messages.list(accountId, threadId, c.req.valid('query')))
    })
    .post('/:accountId/:threadId/messages', docs('messages'), validate('json', SendMessageRequest), async (c) => {
      const { accountId, threadId } = c.req.param()
      await messages.send(accountId, threadId, c.req.valid('json'))
      return ok(c, null)
    })
    .post('/:accountId/:threadId/attachments', docs('messages'), validate('form', SendAttachmentsRequest), async (c) => {
      const { accountId, threadId } = c.req.param()
      const { 'file[]': list, 'dims[]': dims, text, quoteMsgId } = c.req.valid('form')
      const uploads = await Promise.all(
        list.map(async (f, i) => {
          const [width, height] = dims[i] ? dims[i].split('x').map(Number) : []
          return { name: f.name, data: Buffer.from(await f.arrayBuffer()), width, height }
        }),
      )
      await messages.send(accountId, threadId, { text, quoteMsgId }, uploads)
      return ok(c, null)
    })
    .post('/:accountId/:threadId/stickers', docs('messages'), validate('json', SendStickerRequest), async (c) => {
      const { accountId, threadId } = c.req.param()
      await messages.sendSticker(accountId, threadId, c.req.valid('json'))
      return ok(c, null)
    })
    .post('/:accountId/:threadId/messages/:msgId/reactions', docs('messages'), validate('json', ReactRequest), async (c) => {
      const { accountId, threadId, msgId } = c.req.param()
      await messages.react(accountId, threadId, msgId, c.req.valid('json'))
      return ok(c, null)
    })
    .delete('/:accountId/:threadId/messages/:msgId', docs('messages'), async (c) => {
      const { accountId, threadId, msgId } = c.req.param()
      await messages.recall(accountId, threadId, msgId)
      return ok(c, null)
    })
