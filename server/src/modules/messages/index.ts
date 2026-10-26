import { Hono } from 'hono'
import { z } from 'zod'
import { apiDocs, successResponse, validate } from '../../core'
import {
  ListMessagesRequest,
  ReactRequest,
  SearchMessagesRequest,
  SearchStickersRequest,
  SendAttachmentsRequest,
  SendMessageRequest,
  SendStickerRequest,
} from './dtos/requests/message.request'
import { MessageRow, Receipt, Sticker } from './dtos/responses/message.response'
import type IMessageService from './services/interfaces/message-service'

export const messageRoutes = (messages: IMessageService) =>
  new Hono()
    .get('/search', apiDocs('messages', z.array(MessageRow)), validate('query', SearchMessagesRequest), (c) => successResponse(c, messages.search(c.req.valid('query'))))
    .get('/stickers/recent', apiDocs('messages', z.array(Sticker)), (c) => successResponse(c, messages.recentStickers()))
    .get('/stickers/search', apiDocs('messages', z.array(Sticker)), validate('query', SearchStickersRequest), async (c) =>
      successResponse(c, await messages.searchStickers(c.req.valid('query'))),
    )
    .get('/:accountId/:threadId/messages', apiDocs('messages', z.array(MessageRow)), validate('query', ListMessagesRequest), (c) => {
      const { accountId, threadId } = c.req.param()
      return successResponse(c, messages.list(accountId, threadId, c.req.valid('query')))
    })
    .get('/:accountId/:threadId/receipts', apiDocs('messages', z.array(Receipt)), (c) => {
      const { accountId, threadId } = c.req.param()
      return successResponse(c, messages.receipts(accountId, threadId))
    })
    .post('/:accountId/:threadId/messages', apiDocs('messages'), validate('json', SendMessageRequest), async (c) => {
      const { accountId, threadId } = c.req.param()
      await messages.send(accountId, threadId, c.req.valid('json'))
      return successResponse(c, null)
    })
    .post('/:accountId/:threadId/attachments', apiDocs('messages'), validate('form', SendAttachmentsRequest), async (c) => {
      const { accountId, threadId } = c.req.param()
      const { 'file[]': list, 'dims[]': dims, text, quoteMsgId } = c.req.valid('form')
      const uploads = await Promise.all(
        list.map(async (f, i) => {
          const [width, height] = dims[i] ? dims[i].split('x').map(Number) : []
          return { name: f.name, data: Buffer.from(await f.arrayBuffer()), width, height }
        }),
      )
      await messages.send(accountId, threadId, { text, quoteMsgId }, uploads)
      return successResponse(c, null)
    })
    .post('/:accountId/:threadId/stickers', apiDocs('messages'), validate('json', SendStickerRequest), async (c) => {
      const { accountId, threadId } = c.req.param()
      await messages.sendSticker(accountId, threadId, c.req.valid('json'))
      return successResponse(c, null)
    })
    .post('/:accountId/:threadId/messages/:msgId/reactions', apiDocs('messages'), validate('json', ReactRequest), async (c) => {
      const { accountId, threadId, msgId } = c.req.param()
      await messages.react(accountId, threadId, msgId, c.req.valid('json'))
      return successResponse(c, null)
    })
    .delete('/:accountId/:threadId/messages/:msgId', apiDocs('messages'), async (c) => {
      const { accountId, threadId, msgId } = c.req.param()
      await messages.recall(accountId, threadId, msgId)
      return successResponse(c, null)
    })
