import type { Hono } from 'hono'
import { requestLog } from '../middlewares/request-log.middleware'

export const useLogger = (app: Hono) => {
  app.use(requestLog)
}
