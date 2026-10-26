import { appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tryGetContext } from 'hono/context-storage'
import { config } from '../../config'

const levels = { debug: 10, info: 20, warn: 30, error: 40 }
type Level = keyof typeof levels
type Fields = Record<string, unknown>

const min = levels[config.logLevel as Level] ?? levels.info
const file = join(config.dataDir, 'server.log')


try { renameSync(file, file + '.1') } catch {}

function write(level: Level, msg: string, fields?: Fields) {
  if (levels[level] < min) return
  const rid = tryGetContext()?.get('requestId')
  const extra = JSON.stringify({ rid, ...fields }, (_, v) => (v instanceof Error ? v.stack ?? v.message : v))
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}${extra === '{}' ? '' : ' ' + extra}\n`
  process.stderr.write(line)
  appendFileSync(file, line)
}

export const logger = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
}
