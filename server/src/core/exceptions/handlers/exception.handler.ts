import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZaloApiError } from 'zca-js'
import { ZodError } from 'zod'
import { fail } from '../../http/api.response'
import { logger } from '../../logger/logger'
import { ErrorBase } from '../error-base'

export const exceptionHandler: ErrorHandler = (err, c) => {
  if (err instanceof ErrorBase) return fail(c, err.status, err.message, err.code)
  if (err instanceof ZodError) return fail(c, 400, 'invalid input', 'VALIDATION_ERROR', err.issues)
  // Hono tự throw HTTPException (vd JSON hỏng trong validator)
  if (err instanceof HTTPException) return fail(c, err.status, err.message, `HTTP_${err.status}`)
  // Zalo từ chối (tệp quá lớn, đuôi bị chặn, phiên hết hạn...): không phải lỗi của server
  if (err instanceof ZaloApiError) {
    logger.warn('zalo rejected', { err, code: err.code })
    return fail(c, 502, err.message, 'ZALO_ERROR')
  }
  logger.error('unhandled', { err })
  return fail(c, 500, 'internal error', 'INTERNAL_ERROR')
}
