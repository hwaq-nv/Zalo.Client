import type { Hono } from 'hono'
import { contextStorage } from 'hono/context-storage'
import { requestId } from 'hono/request-id'

export const useTracing = (app: Hono) => {
  app.use(requestId(), contextStorage())
}
