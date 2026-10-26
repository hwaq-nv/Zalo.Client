import { EventEmitter } from 'node:events'
import { injectable } from 'inversify'
import {
  CloseReason,
  Zalo,
  type API,
  type Credentials,
  type LoginQRCallback,
  type ThreadType,
} from 'zca-js'
import { VoicecallApi, VoicecallProps, ZaloEvents } from './types'
import { USER_AGENT } from './constants'

@injectable()
export class ZaloClient extends EventEmitter<ZaloEvents> {
  private sessions = new Map<string, API>()

  private createZalo() {
    return new Zalo({ selfListen: true, checkUpdate: false, logging: false })
  }

  getApi(accountId: string) {
    return this.sessions.get(accountId)
  }

  loginQR(callback: LoginQRCallback) {
    return this.createZalo().loginQR({ userAgent: USER_AGENT }, callback)
  }

  login(credentials: Credentials) {
    return this.createZalo().login(credentials)
  }


  getCredentials(api: API): Credentials {
    const ctx = api.getContext()
    return { imei: ctx.imei, userAgent: ctx.userAgent, cookie: api.getCookie().toJSON()?.cookies ?? [] }
  }

  attach(id: string, api: API) {
    this.detach(id)
    this.sessions.set(id, api)
    const listener = api.listener
    listener.on('connected', () => this.emit('status', id, 'online'))
    listener.on('disconnected', () => this.emit('status', id, 'connecting'))
    listener.on('closed', (code) => this.emit('status', id, code === CloseReason.DuplicateConnection ? 'kicked' : 'offline'))
    listener.on('message', (m) => this.emit('message', id, m))
    listener.on('old_messages', (msgs, type) => this.emit('old_messages', id, msgs, type))
    listener.on('undo', (u) => this.emit('undo', id, u))
    listener.on('reaction', (r) => this.emit('reaction', id, r))
    listener.on('old_reactions', (rs, isGroup) => this.emit('old_reactions', id, rs, isGroup))
    listener.on('friend_event', (e) => this.emit('friend_event', id, e))
    listener.on('group_event', (e) => this.emit('group_event', id, e))
    listener.on('voip', (c) => this.emit('voip', id, c))
    if (!('voicecall' in api))
      api.custom<unknown, VoicecallProps>('voicecall', async ({ utils, props }) => {
        const params = utils.encodeAES(JSON.stringify(props.params))
        if (!params) throw new Error('voicecall: encrypt failed')
        const url = utils.makeURL(`${api.zpwServiceMap.voice_call[0]}/api/voicecall/${props.path}`, { params })
        return utils.resolve(await utils.request(url, { method: 'GET' }))
      })
    listener.start({ retryOnClose: true })
    this.emit('attached', id, api)
  }

  voicecall(id: string, path: string, params: Record<string, unknown>) {
    const api = this.sessions.get(id) as VoicecallApi | undefined
    return api ? api.voicecall({ path, params }) : Promise.reject(new Error('account offline'))
  }

  requestOldMessages(id: string, type: ThreadType, lastId: string | null) {
    this.sessions.get(id)?.listener.requestOldMessages(type, lastId)
  }

  requestOldReactions(id: string, type: ThreadType, lastId: string | null) {
    this.sessions.get(id)?.listener.requestOldReactions(type, lastId)
  }

  restartListener(id: string) {
    this.sessions.get(id)?.listener.start({ retryOnClose: true })
  }

  detach(id: string) {
    const api = this.sessions.get(id)
    api?.listener.removeAllListeners()
    api?.listener.stop()
    this.sessions.delete(id)
  }
}
