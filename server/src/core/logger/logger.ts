import { appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tryGetContext } from 'hono/context-storage'
import { config } from '../../config'

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
type Level = keyof typeof LOG_LEVELS
type Fields = Record<string, unknown>

const minLevel = LOG_LEVELS[config.logLevel as Level] ?? LOG_LEVELS.info
const logFile = join(config.dataDir, 'server.log')


try { renameSync(logFile, logFile + '.1') } catch {}

function writeLog(level: Level, msg: string, fields?: Fields) {
  if (LOG_LEVELS[level] < minLevel) return
  const requestId = tryGetContext()?.get('requestId')
  const fieldsJson = JSON.stringify({ rid: requestId, ...fields }, (_, v) => (v instanceof Error ? v.stack ?? v.message : v))
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}${fieldsJson === '{}' ? '' : ' ' + fieldsJson}\n`
  process.stderr.write(line)
  appendFileSync(logFile, line)
}

export const logger = {
  debug: (msg: string, fields?: Fields) => writeLog('debug', msg, fields),
  info: (msg: string, fields?: Fields) => writeLog('info', msg, fields),
  warn: (msg: string, fields?: Fields) => writeLog('warn', msg, fields),
  error: (msg: string, fields?: Fields) => writeLog('error', msg, fields),
}
