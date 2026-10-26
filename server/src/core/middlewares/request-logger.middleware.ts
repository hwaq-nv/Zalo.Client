import { createMiddleware } from 'hono/factory'
import { logger } from '../logger/logger'

export const requestLogger = createMiddleware(async (c, next) => {
  const startedAt = performance.now()
  await next()
  // c.req.path không có query → token của /ws?token= không lọt vào log
  logger.info(`${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - startedAt)}ms`)
})
