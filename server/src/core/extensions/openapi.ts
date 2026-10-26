import { Scalar } from '@scalar/hono-api-reference'
import type { Hono } from 'hono'
import { describeRoute, openAPIRouteHandler, resolver } from 'hono-openapi'
import { z } from 'zod'

const ApiErrorSchema = z.object({
  status: z.number(),
  message: z.string(),
  data: z.null(),
  code: z.string(),
  requestId: z.string(),
  errors: z.array(z.unknown()).optional(),
})

const jsonContent = (schema: z.ZodType) => ({ 'application/json': { schema: resolver(schema) } })

export const apiDocs = (tag: string, data: z.ZodType = z.null(), status = 200) =>
  describeRoute({
    tags: [tag],
    responses: {
      [status]: { description: 'ok', content: jsonContent(z.object({ status: z.literal(status), message: z.string(), data })) },
      default: { description: 'error', content: jsonContent(ApiErrorSchema) },
    },
  })

// Đăng ký trước auth để mở /docs không cần token; không nhúng token vào trang vì cors() mở mọi origin
export const useOpenApi = (app: Hono) => {
  app.get(
    '/openapi.json',
    openAPIRouteHandler(app, {
      documentation: {
        info: { title: 'Nexoraxx Zalo API', version: '0.0.0' },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        security: [{ bearer: [] }],
      },
      defaultValidationErrorResponse: false,
    }),
  )
  app.get('/docs', Scalar({ url: '/openapi.json' }))
}
