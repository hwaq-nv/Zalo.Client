import type { Hono } from 'hono'
import { requestLogger } from '../middlewares/request-logger.middleware'

export const useLogger = (app: Hono) => {
  app.use(requestLogger)
}
