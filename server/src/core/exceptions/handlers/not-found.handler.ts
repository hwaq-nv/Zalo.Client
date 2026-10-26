import type { NotFoundHandler } from 'hono'
import { fail } from '../../http/api.response'

export const notFoundHandler: NotFoundHandler = (c) => fail(c, 404, 'not found', 'NOT_FOUND')
