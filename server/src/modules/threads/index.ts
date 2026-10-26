import { Hono } from 'hono'
import { z } from 'zod'
import { apiDocs, successResponse, validate } from '../../core'
import { ListThreadContactsRequest, ListThreadsRequest } from './dtos/requests/thread.request'
import { ThreadRow } from './dtos/responses/thread.response'
import type IThreadService from './services/interfaces/thread-service'

export const threadRoutes = (threads: IThreadService) =>
  new Hono()
    .get('/', apiDocs('threads', z.array(ThreadRow)), validate('query', ListThreadsRequest), (c) => successResponse(c, threads.list(c.req.valid('query').accountId)))
    .get('/contacts', apiDocs('threads', z.array(ThreadRow)), validate('query', ListThreadContactsRequest), (c) =>
      successResponse(c, threads.contacts(c.req.valid('query').accountId)),
    )
    .post('/:accountId/:threadId/read', apiDocs('threads'), (c) => {
      const { accountId, threadId } = c.req.param()
      threads.markRead(accountId, threadId)
      return successResponse(c, null)
    })
