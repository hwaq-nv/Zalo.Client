import { timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { config } from '../../config'
import { UnauthorizedError } from '../exceptions/http-errors'

const expectedToken = Buffer.from(config.token)

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = Buffer.from(c.req.header('authorization')?.replace(/^Bearer /, '') ?? c.req.query('token') ?? '')
  if (token.length !== expectedToken.length || !timingSafeEqual(token, expectedToken)) {
    throw new UnauthorizedError()
  }
  await next()
})
