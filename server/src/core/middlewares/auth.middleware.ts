import { timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { config } from '../../config'
import { UnauthorizedError } from '../exceptions/http-errors'

const expected = Buffer.from(config.token)

export const auth = createMiddleware(async (c, next) => {
  const token = Buffer.from(c.req.header('authorization')?.replace(/^Bearer /, '') ?? c.req.query('token') ?? '')
  if (token.length !== expected.length || !timingSafeEqual(token, expected)) {
    throw new UnauthorizedError()
  }
  await next()
})
