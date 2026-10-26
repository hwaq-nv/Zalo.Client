import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type BaseResponse<T = null> = {
  status: number
  message: string
  data: T
  code?: string
  requestId?: string
  errors?: unknown
}

export const ok = <T>(c: Context, data: T, message = 'ok', status: ContentfulStatusCode = 200) =>
  c.json({ status, message, data } satisfies BaseResponse<T>, status)

export const fail = (c: Context, status: ContentfulStatusCode, message: string, code: string, errors?: unknown) =>
  c.json({ status, message, data: null, code, requestId: c.get('requestId'), errors } satisfies BaseResponse, status)
