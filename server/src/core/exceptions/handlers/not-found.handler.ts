import type { NotFoundHandler } from 'hono'
import { errorResponse } from '../../http/api.response'

export const notFoundHandler: NotFoundHandler = (c) => errorResponse(c, 404, 'not found', 'NOT_FOUND')
