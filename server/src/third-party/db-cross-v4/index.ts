import { Database } from 'bun:sqlite'
import crypto from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

type BinNet = { attachs?: Record<string, unknown>[]; quote?: Record<string, unknown>; mentions?: Record<string, unknown>[] }

type DbCross = {
  decompressAndDecryptDb_V2(input: string, output: string, key: string): { result: number; error_message: string }
  parseBinNet(data: Uint8Array): { result: number; data: BinNet }
}

type ChatContentRow = {
  TimeStamp: bigint
  MsgContent: string | null
  GlbMsgId: bigint | null
  CliMsgId: bigint | null
  SenderId: bigint | string
  MsgType: bigint
  BinNet?: Uint8Array | null
}

export type BackupMessage = {
  threadId: string
  isGroup: boolean
  data: {
    msgId: string
    cliMsgId: string
    uidFrom: string
    dName: string
    ts: string
    msgType: string
    content: string | Record<string, unknown>
    quote?: Record<string, unknown>
    mentions?: Record<string, unknown>[]
    backupMsgType: number
  }
}

const MSG_TYPES: Record<number, string> = {
  0: 'webchat',
  2: 'chat.doodle',
  3: 'chat.photo',
  4: 'chat.photo',
  6: 'chat.voice',
  10: 'chat.sticker',
  12: 'chat.recommended',
  15: 'chat.list.action',
  18: 'chat.location.new',
  19: 'chat.video.msg',
  20: 'webchat',
  22: 'share.file',
  23: 'chat.gif',
  24: 'chat.webcontent',
  25: 'chat.video.live.msg',
  26: 'group.poll',
  31: 'chat.photo',
  33: 'chat.delete',
  36: 'chat.undo',
  53: 'chat.webcontent.v2',
}

const SKIPPED_MSG_TYPES = [20, 21, 25, 26, 29, 32, 34, 35, 45, 51, 52]

export function requireDbCross(): DbCross {
  try {
    return require('./build/Release/db-cross-v4-native.node')
  } catch {
    throw new Error('db-cross-v4 addon is not built, run `bun run build:native` in server/')
  }
}

// Bun chặn RSA_PKCS1_PADDING khi giải bằng private key nên tự bỏ padding PKCS#1 v1.5 (00 02 PS 00 M)
function rsaDecrypt(privateKey: string, encrypted: string) {
  const block = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_NO_PADDING }, Buffer.from(encrypted, 'base64'))
  if (block[0] !== 0 || block[1] !== 2) throw new Error('encrypted_key does not match the session RSA key')
  return block.subarray(block.indexOf(0, 2) + 1)
}

// Chưa rõ Zalo PC đưa key cho addon dạng hex hay chuỗi gốc; key sai thì addon trả lỗi magic header nên thử lần lượt
export function readBackup(file: string, privateKey: string, encryptedKey: string): BackupMessage[] {
  const addon = requireDbCross()
  const key = rsaDecrypt(privateKey, encryptedKey)
  const dir = mkdtempSync(join(tmpdir(), 'zalo-backup-'))
  try {
    let error = ''
    for (const candidate of [key.toString('hex'), key.toString('latin1')]) {
      const result = addon.decompressAndDecryptDb_V2(file, dir, candidate)
      if (result.result === 0) return readChats(addon, dir)
      error = result.error_message
    }
    throw new Error(`decrypt backup: ${error}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function readChats(addon: DbCross, dir: string) {
  const messages: BackupMessage[] = []
  for (const path of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const name = basename(path).match(/^(group_)?(.+)\.db$/)
    if (!name) continue
    const db = new Database(join(dir, path), { readonly: true, safeIntegers: true })
    try {
      if (!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ChatContent'").get()) continue
      const rows = db.query(`SELECT * FROM ChatContent WHERE MsgStatus > 0 AND CliMsgId NOT NULL AND GlbMsgId > 0 AND MsgType NOT IN (${SKIPPED_MSG_TYPES})`)
      for (const row of rows.iterate() as Iterable<ChatContentRow>) {
        const msgType = MSG_TYPES[Number(row.MsgType)]
        if (!msgType) continue
        const binNet = row.BinNet?.length ? addon.parseBinNet(row.BinNet) : undefined
        const { attachs, quote, mentions } = binNet?.result === 0 ? binNet.data : {}
        const attach = msgType === 'webchat' ? undefined : attachs?.[0]
        messages.push({
          threadId: name[2],
          isGroup: !!name[1],
          data: {
            msgId: String(row.GlbMsgId),
            cliMsgId: String(row.CliMsgId ?? ''),
            uidFrom: String(row.SenderId),
            dName: '',
            ts: String(row.TimeStamp),
            msgType,
            content: attach ?? row.MsgContent ?? '',
            quote,
            mentions,
            backupMsgType: Number(row.MsgType),
          },
        })
      }
    } finally {
      db.close()
    }
  }
  return messages
}
