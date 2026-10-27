import { EventEmitter } from 'node:events'
import { injectable } from 'inversify'
import {
  CloseReason,
  Zalo,
  type API,
  type Credentials,
  type LoginQRCallback,
  type ThreadType,
} from '@hwqnq/zca-js'
import { MiniProfile, MiniProfilesProps, NoiseIdsRequest, NoiseIdsResponse, SyncApi, SyncMessagesProps, VoicecallApi, VoicecallProps, ZaloEvents } from './types'
import { API_TYPE, API_VERSION, USER_AGENT } from './constants'

const cookieHeader = (api: API) => {
  const jar = api.getCookie()
  const cookies = new Map((jar.toJSON()?.cookies ?? []).map((c) => [c.key, c.value]))
  for (const c of jar.getCookiesSync('https://chat.zalo.me')) cookies.set(c.key, c.value)
  const sek = api.getContext().loginInfo.zpw_sek
  if (sek) cookies.set('zpw_sek', sek)
  return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
}

@injectable()
export class ZaloClient extends EventEmitter<ZaloEvents> {
  private sessions = new Map<string, API>()

  private createZalo() {
    return new Zalo({ selfListen: true, checkUpdate: false, logging: false, apiType: API_TYPE, apiVersion: API_VERSION })
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


  private syncSekCookie(api: API) {
    const ctx = api.getContext()
    const sek = ctx.loginInfo?.zpw_sek
    if (!sek) return
    const jar = api.getCookie()
    for (const domain of ['chat.zalo.me', 'zalo.me', 'zaloapp.com']) {
      try {
        jar.setCookieSync(`zpw_sek=${sek}; Domain=${domain}; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=None`, `https://${domain}`)
      } catch {}
    }
    for (const urls of Object.values(api.zpwServiceMap ?? {})) {
      for (const u of urls) {
        try {
          const domain = new URL(u).hostname
          jar.setCookieSync(`zpw_sek=${sek}; Domain=${domain}; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=None`, `https://${domain}`)
        } catch {}
      }
    }
  }

  getCredentials(api: API): Credentials {
    this.syncSekCookie(api)
    const ctx = api.getContext()
    return { imei: ctx.imei, userAgent: ctx.userAgent, cookie: api.getCookie().toJSON()?.cookies ?? [] }
  }

  attach(id: string, api: API) {
    this.detach(id)
    this.syncSekCookie(api)
    this.sessions.set(id, api)
    const listener = api.listener
    listener.on('connected', () => this.emit('status', id, 'online'))
    listener.on('disconnected', () => this.emit('status', id, 'connecting'))
    listener.on('closed', (code) => this.emit('status', id, code === CloseReason.DuplicateConnection ? 'kicked' : 'offline'))
    listener.on('message', (m) => this.emit('message', id, m))
    listener.on('old_messages', (msgs, type) => this.emit('old_messages', id, msgs, type))
    listener.on('undo', (u) => this.emit('undo', id, u))
    listener.on('reaction', (r) => this.emit('reaction', id, r))
    listener.on('seen_messages', (s) => this.emit('seen_messages', id, s))
    listener.on('delivered_messages', (d) => this.emit('delivered_messages', id, d))
    listener.on('typing', (t) => this.emit('typing', id, t))
    listener.on('old_reactions', (rs, isGroup) => this.emit('old_reactions', id, rs, isGroup))
    listener.on('friend_event', (e) => this.emit('friend_event', id, e))
    listener.on('group_event', (e) => this.emit('group_event', id, e))
    listener.on('voip', (c) => this.emit('voip', id, c))
    listener.on('sync_event', (c) => this.emit('sync_event', id, c))
    if (!('voicecall' in api))
      api.custom<unknown, VoicecallProps>('voicecall', async ({ utils, props }) => {
        const params = utils.encodeAES(JSON.stringify(props.params))
        if (!params) throw new Error('voicecall: encrypt failed')
        const url = utils.makeURL(`${api.zpwServiceMap.voice_call[0]}/api/voicecall/${props.path}`, { params })
        return utils.resolve(await utils.request(url, { method: 'GET' }))
      })
    if (!('syncMessages' in api))
      api.custom<unknown, SyncMessagesProps>('syncMessages', async ({ ctx, utils, props }) => {
        const params = utils.encodeAES(JSON.stringify({ ...props.params, imei: ctx.imei }))
        if (!params) throw new Error('syncMessages: encrypt failed')
        const url = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/${props.path}`, { params })
        return utils.resolve(await utils.request(url, { method: 'GET' }))
      })
    if (!('znoise' in api))
      api.custom<NoiseIdsResponse, NoiseIdsRequest>('znoise', async ({ ctx, utils, props }) => {
        const params = utils.encodeAES(JSON.stringify(props))
        if (!params) throw new Error('znoise: encrypt failed')
        const sek = ctx.loginInfo.zpw_sek
        const url = utils.makeURL('https://zwid.api.zalo.me/api/znoise', sek ? { zpw_sek: sek } : {})
        return utils.resolve(await utils.request(url, { method: 'POST', headers: { Cookie: cookieHeader(api) }, body: new URLSearchParams({ params }) }))
      })
    if (!('getminiprofiles' in api))
      api.custom<Record<string, MiniProfile>, MiniProfilesProps>('getminiprofiles', async ({ utils, props }) => {
        const params = utils.encodeAES(JSON.stringify({ friend_ids: props.friend_ids, avatar_size: 120, incInvalid: 1, srcReq: -1 }))
        if (!params) throw new Error('getminiprofiles: encrypt failed')
        const url = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/friend/getminiprofiles`)
        return utils.resolve(await utils.request(url, { method: 'POST', body: new URLSearchParams({ params }) }))
      })
    listener.start({ retryOnClose: true })
    this.emit('attached', id, api)
  }

  voicecall(id: string, path: string, params: Record<string, unknown>) {
    const api = this.sessions.get(id) as VoicecallApi | undefined
    return api ? api.voicecall({ path, params }) : Promise.reject(new Error('account offline'))
  }

  syncMessages(id: string, path: string, params: Record<string, unknown>) {
    const api = this.sessions.get(id) as SyncApi | undefined
    return api ? api.syncMessages({ path, params }) : Promise.reject(new Error('account offline'))
  }

  noiseIds(id: string, ids: NoiseIdsRequest) {
    const api = this.sessions.get(id) as SyncApi | undefined
    return api ? api.znoise(ids) : Promise.reject(new Error('account offline'))
  }

  miniProfiles(id: string, friendIds: string[]) {
    const api = this.sessions.get(id) as SyncApi | undefined
    return api ? api.getminiprofiles({ friend_ids: friendIds }) : Promise.reject(new Error('account offline'))
  }

  async download(id: string, url: string) {
    const api = this.sessions.get(id)
    if (!api) throw new Error('account offline')
    const res = await fetch(url, { headers: { cookie: cookieHeader(api), 'user-agent': api.getContext().userAgent } })
    if (!res.ok) throw new Error(`download ${res.status} ${res.statusText}`)
    return res
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
