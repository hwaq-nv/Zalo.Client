import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import { z } from 'zod'
import { docs, logger, ok, topicWs, validate } from '../../core'
import { CallAction, StartCallRequest } from './dtos/requests/call.request'
import { GroupCallMembers } from './dtos/responses/call.response'
import { mediaLink } from '../../third-party/zcall/native-engine/audio-link'
import type ICallService from './services/interfaces/call-service'


export const callRoutes = (calls: ICallService) =>
  new Hono()
    .get(
      '/ws',
      topicWs('calls', {
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
    .get('/:accountId/groups/:groupId/members', docs('calls', GroupCallMembers), async (c) => {
      const { accountId, groupId } = c.req.param()
      return ok(c, await calls.groupMembers(accountId, groupId))
    })
    .post('/:accountId', docs('calls', z.null(), 202), validate('json', StartCallRequest), (c) => {
      calls.start(c.req.param('accountId'), c.req.valid('json'))
      return ok(c, null, 'accepted', 202)
    })
