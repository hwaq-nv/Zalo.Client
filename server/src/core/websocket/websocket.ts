import type { Server, ServerWebSocket } from 'bun'
import { getBunServer, upgradeWebSocket } from 'hono/bun'
import type { ServerEvent } from '../../types'

let server: Server<unknown> | undefined

// Mỗi topic một kênh pub/sub của Bun. opened: gửi riêng cho client vừa nối (trạng thái hiện tại)
export const topicWs = (topic: string, on: { opened?: (send: (m: string) => void) => void; message?: (m: string) => void } = {}) =>
  upgradeWebSocket((c) => {
    server ??= getBunServer(c)
    return {
      onOpen: (_, ws) => {
        ;(ws.raw as ServerWebSocket).subscribe(topic)
        on.opened?.((m) => ws.send(m))
      },
      onMessage: (e) => on.message?.(String(e.data)),
    }
  })

export const publish = (topic: string, data: string | Uint8Array) => server?.publish(topic, data)

export const eventsWs = topicWs('events')

export const broadcast = (e: ServerEvent) => publish('events', JSON.stringify(e))
