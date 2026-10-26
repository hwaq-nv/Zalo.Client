import { Hono } from 'hono'
import { z } from 'zod'
import { docs, ok, validate } from '../../core'
import { ListThreadContactsRequest, ListThreadsRequest } from './dtos/requests/thread.request'
import { ThreadRow } from './dtos/responses/thread.response'
import type IThreadService from './services/interfaces/thread-service'

export const threadRoutes = (threads: IThreadService) =>
  new Hono()
    .get('/', docs('threads', z.array(ThreadRow)), validate('query', ListThreadsRequest), (c) => ok(c, threads.list(c.req.valid('query').accountId)))
    .get('/contacts', docs('threads', z.array(ThreadRow)), validate('query', ListThreadContactsRequest), (c) =>
      ok(c, threads.contacts(c.req.valid('query').accountId)),
    )
    .post('/:accountId/:threadId/read', docs('threads'), (c) => {
      const { accountId, threadId } = c.req.param()
      threads.markRead(accountId, threadId)
      return ok(c, null)
    })
