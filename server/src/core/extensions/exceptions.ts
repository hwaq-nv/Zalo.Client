import type { Hono } from 'hono'
import { exceptionHandler } from '../exceptions/handlers/exception.handler'
import { notFoundHandler } from '../exceptions/handlers/not-found.handler'
import { logger } from '../logger/logger'

export const useExceptionHandler = (app: Hono) => {
  app.onError(exceptionHandler)
  app.notFound(notFoundHandler)
  process.on('uncaughtException', (err) => logger.error('uncaughtException', { err }))
  process.on('unhandledRejection', (err) => logger.error('unhandledRejection', { err }))
}
