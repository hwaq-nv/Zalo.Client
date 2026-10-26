import { Hono } from 'hono'
import { z } from 'zod'
import { apiDocs, successResponse, validate } from '../../core'
import { FindByPhoneRequest, ListThreadContactsRequest, ListThreadsRequest } from './dtos/requests/thread.request'
import { Presence, ThreadRow } from './dtos/responses/thread.response'
import type IThreadService from './services/interfaces/thread-service'

export const threadRoutes = (threads: IThreadService) =>
  new Hono()
    .get('/', apiDocs('threads', z.array(ThreadRow)), validate('query', ListThreadsRequest), (c) => successResponse(c, threads.list(c.req.valid('query').accountId)))
    .get('/contacts', apiDocs('threads', z.array(ThreadRow)), validate('query', ListThreadContactsRequest), (c) =>
      successResponse(c, threads.contacts(c.req.valid('query').accountId)),
    )
    .get('/find', apiDocs('threads', ThreadRow), validate('query', FindByPhoneRequest), async (c) => successResponse(c, await threads.findByPhone(c.req.valid('query'))))
    // "/info" chứ không phải "/:accountId/:threadId": trùng với /threads/stickers/recent của module messages
    .get('/:accountId/:threadId/info', apiDocs('threads', ThreadRow), (c) => {
      const { accountId, threadId } = c.req.param()
      return successResponse(c, threads.get(accountId, threadId))
    })
    .get('/:accountId/:threadId/presence', apiDocs('threads', Presence), async (c) => {
      const { accountId, threadId } = c.req.param()
      return successResponse(c, await threads.presence(accountId, threadId))
    })
    .post('/:accountId/:threadId/read', apiDocs('threads'), (c) => {
      const { accountId, threadId } = c.req.param()
      threads.markRead(accountId, threadId)
      return successResponse(c, null)
    })
