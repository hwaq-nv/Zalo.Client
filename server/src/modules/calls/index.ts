import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import { z } from 'zod'
import { apiDocs, logger, successResponse, topicWebSocket, validate } from '../../core'
import { CallAction, StartCallRequest } from './dtos/requests/call.request'
import { GroupCallMembers } from './dtos/responses/call.response'
import { mediaLink } from '../../third-party/zcall/native-engine/audio-link'
import type ICallService from './services/interfaces/call-service'


export const callRoutes = (calls: ICallService) =>
  new Hono()
    .get(
      '/ws',
      topicWebSocket('calls', {
        opened: (send) => calls.snapshot().forEach((m) => send(JSON.stringify(m))),
        message: (m) => {
          try {
            calls.action(CallAction.parse(JSON.parse(m)))
          } catch (err) {
            logger.warn('call: bad action', { err })
          }
        },
      }),
    )
    .get(
      '/media/ws',
      upgradeWebSocket(() => ({
        onOpen: (_, ws) => mediaLink.attach(ws.raw as ServerWebSocket),
        onMessage: (e) => mediaLink.receive(e.data as string | ArrayBuffer),
        onClose: (_, ws) => mediaLink.detach(ws.raw as ServerWebSocket),
      })),
    )
    .get('/:accountId/groups/:groupId/members', apiDocs('calls', GroupCallMembers), async (c) => {
      const { accountId, groupId } = c.req.param()
      return successResponse(c, await calls.groupMembers(accountId, groupId))
    })
    .post('/:accountId', apiDocs('calls', z.null(), 202), validate('json', StartCallRequest), (c) => {
      calls.start(c.req.param('accountId'), c.req.valid('json'))
      return successResponse(c, null, 'accepted', 202)
    })
