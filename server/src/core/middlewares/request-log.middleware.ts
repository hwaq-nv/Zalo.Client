import { createMiddleware } from 'hono/factory'
import { logger } from '../logger/logger'

export const requestLog = createMiddleware(async (c, next) => {
  const start = performance.now()
  await next()
  // c.req.path không có query → token của /ws?token= không lọt vào log
  logger.info(`${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - start)}ms`)
})
