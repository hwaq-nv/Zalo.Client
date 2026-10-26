import { format } from 'node:util'
import { inject, injectable } from 'inversify'
import { ThreadType } from 'zca-js'
import { BadRequestError, ConflictError, logger, NotFoundError, publish } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import { mediaLink } from '../../../../third-party/zcall/native-engine/audio-link'
import { ZrtcMediaBackend } from '../../../../third-party/zcall/native-engine/backends/zrtc-media'
import { EngineCore } from '../../../../third-party/zcall/native-engine/engine-core'
import type { CallMessage } from '../../../../types'
import type IThreadRepository from '../../../threads/repositories/interfaces/thread-repository'
import type { CallAction, StartCallRequest } from '../../dtos/requests/call.request'
import type ICallService from '../interfaces/call-service'
import { CallUi } from './call-ui'
import { VoipControl } from '../../../../third-party/zalo/types'

type SignalData = Record<string, any>
type Signal = [path: string, params: (d: SignalData, imei: string) => SignalData]

const CALLS_TOPIC = 'calls'
// Zalo PC bỏ control cũ hơn một phút
const CONTROL_TTL_MS = 60_000

const groupMemberParams: Signal[1] = (d) => ({ calleeId: d.calleeId, callId: d.callId, callType: d.callType, hostCall: d.hostCall, data: d.data, partners: d.partners })
const groupStateParams: Signal[1] = (d) => ({
  callId: d.callId, hostCall: d.hostCall, userId: d.userId, callstate: d.callState, audiostate: d.audioState, videostate: d.videoState, params: d.params,
})

// sendSignal của engine → /api/voicecall/<path>, tham số như handleSendSignal + ZaloApi.requestCall... của Zalo PC 26.10.20
const SIGNALS: Record<number, Signal> = {
  401: ['requestcall', (d, imei) => ({ calleeId: d.calleeId, callId: d.callId, codec: d.codec ?? '[]', typeRequest: d.type, imei })],
  416: ['request', (d, imei) => ({
    calleeId: d.calleeId, rtcpAddress: d.rtcpAddress, rtpAddress: d.rtpAddress, codec: d.codec, session: d.session, callId: d.callId, imei,
    ...(d.extendData && { extendData: d.extendData, subCommand: 3 }),
  })],
  407: ['ringring', (d, imei) => ({ callerId: d.callerId, callId: d.callId, status: 0, imei })],
  408: ['answerack', (d, imei) => ({ calleeId: d.calleeId, callId: d.callId, status: 0, imei })],
  402: ['answer', (d) => ({
    callerId: d.callerId, callId: d.callId, status: d.status, codec: d.codec || '', rtcpAddress: d.rtcpAddress, rtpAddress: d.rtpAddress, session_id: d.session,
    ...(d.extendData && { extendData: d.extendData, subCommand: 3 }),
  })],
  405: ['cancel', (d, imei) => ({ callerId: d.toId, callId: d.callId, callType: d.callType, status: 0, imei })],
  406: ['logendcall', (d, imei) => ({ call_id: d.callId, partner_id: d.partnerId, status: d.status, logdata: d.data, duration: d.duration, role: d.role, imei })],
  409: ['endcall', (d, imei) => ({ uidTo: d.toId, callId: d.callId, status: 3, imei })],
  12006: ['conf', (d) => ({ calleeId: d.calleeId, callId: d.callId, isOnCam: d.isOnCam, isOnMic: d.isOnMic, data: d.data })],
  12064: ['requestsharescreen', (d) => ({ uidTo: d.uidTo, callId: d.callId, status: d.status })],
  12433: ['group/requestcall', (d) => ({ groupId: d.groupId, callId: d.callId, typeRequest: d.typeRequest, data: d.data, partners: d.partners })],
  12434: ['group/request', (d) => ({
    calleeId: d.calleeId, callId: d.callId, callType: d.callType, data: d.data, session: d.session, partners: d.partners, groupId: d.groupId,
  })],
  12435: ['group/adduser', (d) => ({ ...groupMemberParams(d, ''), session: d.session })],
  12436: ['group/answer', groupMemberParams],
  12437: ['group/cancel', groupMemberParams],
  12438: ['group/endcall', groupMemberParams],
  12439: ['group/ringring', groupMemberParams],
  12445: ['group/state', (d) => ({ callId: d.callId, hostCall: d.hostCall, callType: d.callType })],
  12446: ['group/finish', (d) => ({
    callId: d.callId, callType: d.callType, data: d.data, duration: d.duration, hostCall: d.hostCall, partners: d.partners, status: d.status, joinTime: d.joinTime,
  })],
  12447: ['group/notify', (d) => ({ callId: d.callId, hostCall: d.hostCall, callType: d.callType, status: d.status, data: d.data })],
  12097: ['group/ping', groupStateParams],
  12098: ['group/broadcast', groupStateParams],
  12043: ['group/join', (d) => ({
    userId: d.userId, callId: d.callId, hostCall: d.hostCall, status: d.status, srcJoinCall: d.srcJoinCall, audiostate: d.audioState, videostate: d.videoState, data: d.data,
  })],
  12044: ['group/sharescreen', (d) => ({
    userId: d.userId, callId: d.callId, hostCall: d.hostCall, status: d.status, audiostate: d.audioState, videostate: d.videoState, data: d.data,
  })],
}

// settings.features.group_call_max_users của Zalo, mặc định 5 như Zalo PC
const getMaxGroupCallUsers = (settings: SignalData | undefined) => Number(settings?.features?.group_call_max_users) || 5

// Như _processCtrlMessages của Zalo PC: data là chuỗi JSON thì parse
const parseControlData = (d: unknown) => (typeof d === 'string' && /^[{[]/.test(d) ? JSON.parse(d) : d)

type CallSession = { engine: EngineCore; ui: CallUi; queue: Promise<void> }


@injectable()
export default class CallService implements ICallService {
  private sessions = new Map<string, CallSession>()

  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.ThreadRepository) private threads: IThreadRepository,
  ) {
    zalo.on('voip', (id, c) => this.handleVoipControl(id, c))
    mediaLink.on('event', (e) => e.type === 'log' && logger.info(`[media] ${e.line}`))
  }

  snapshot() {
    return [...this.sessions].flatMap(([accountId, { ui }]): CallMessage[] => (ui.state ? [{ type: 'state', accountId, state: ui.state }] : []))
  }

  start(accountId: string, { threadId, video, members }: StartCallRequest) {
    const api = this.zalo.getApi(accountId)
    if (!api) throw new ConflictError('account offline', 'ACCOUNT_OFFLINE')
    if (this.isBusy()) throw new ConflictError('already in a call', 'IN_CALL')
    const type = this.threads.typeOf(accountId, threadId)
    if (type === undefined) throw new NotFoundError('thread not found')
    const session = this.getSession(accountId)
    const profile = this.threads.profile(accountId, threadId)
    if (type === ThreadType.User) {
      session.ui.wantCamera = video
      session.engine.onZaloFrame({
        type: 'request',
        command: 'makeCall',
        data: { partner: [{ id: threadId, name: profile?.name ?? '', avatar: profile?.avatar ?? '' }], type: video ? 3 : 1 },
      })
      return
    }
    const maxUsers = getMaxGroupCallUsers(api.getContext().settings)
    if (!members.length) throw new BadRequestError('members required for a group call')
    if (members.length > maxUsers - 1) throw new BadRequestError(`at most ${maxUsers - 1} members`)
    session.ui.wantCamera = video
    session.engine.onZaloFrame({
      type: 'request',
      command: 'makeCall',
      data: { partner: members, type: video ? 6 : 5, groupInfo: { id: threadId, name: profile?.name ?? '', avatar: profile?.avatar ?? '', maxUsers } },
    })
  }

  async groupMembers(accountId: string, groupId: string) {
    const api = this.zalo.getApi(accountId)
    if (!api) throw new ConflictError('account offline', 'ACCOUNT_OFFLINE')
    const info = (await api.getGroupInfo(groupId)).gridInfoMap[groupId]
    if (!info) throw new NotFoundError('group not found')
    const self = api.getOwnId()
    const ids = (info.memberIds?.length ? info.memberIds : info.currentMems.map((m) => m.id)).filter((id) => id !== self)
    // Hỏi hồ sơ cả nhóm trong một lần; nhóm hàng nghìn người thì cần chia trang
    const { profiles } = ids.length ? await api.getGroupMembersInfo(ids) : { profiles: {} as SignalData }
    const members = ids.map((id) => {
      const memberProfile = profiles[id]
      return { id, name: this.threads.profile(accountId, id)?.name || memberProfile?.displayName || memberProfile?.zaloName || id, avatar: memberProfile?.avatar ?? '' }
    })
    return { maxUsers: getMaxGroupCallUsers(api.getContext().settings), members }
  }

  action(a: CallAction) {
    this.sessions.get(a.accountId)?.ui.action(a)
  }

  private isBusy(except?: string) {
    return [...this.sessions].some(([id, { engine }]) => id !== except && engine.call)
  }

  private handleVoipControl(accountId: string, control: VoipControl) {
    let data: SignalData
    try {
      data = parseControlData(control.data)
    } catch (err) {
      return logger.warn('call: bad voip control', { accountId, act: control.act, err })
    }
    const ts = Number(data?.ts)
    if (ts && Date.now() - ts > CONTROL_TTL_MS) return
    if ((control.act === 'request' || control.act === 'group_request') && this.isBusy(accountId)) return
    this.getSession(accountId).engine.onZaloFrame({ type: 'control', data: { ...control, data } })
  }

  private getSession(accountId: string) {
    let session = this.sessions.get(accountId)
    if (session) return session
    const log = (...a: unknown[]) => logger.info(`[zcall] ${format(...a)}`, { accountId })
    const ui = new CallUi(
      accountId,
      {
        message: (m) => publish(CALLS_TOPIC, JSON.stringify(m)),
        video: (src, key, data) => publish(CALLS_TOPIC, Buffer.concat([Buffer.from(JSON.stringify({ accountId, src, key }) + '\n'), data])),
      },
      log,
    )
    const media = new ZrtcMediaBackend({ log, sendUdp: true })
    const engine: EngineCore = new EngineCore({ emit: (f) => this.handleEngineFrame(accountId, engine, f), media, log, ui, group: true })
    session = { engine, ui, queue: Promise.resolve() }
    this.sessions.set(accountId, session)
    engine.onZaloFrame({ type: 'update', command: 'init', data: { local: { id: this.zalo.getApi(accountId)?.getOwnId() ?? '' } } })
    return session
  }

  private handleEngineFrame(accountId: string, engine: EngineCore, f: { type: string; command?: string | number; data?: SignalData }) {
    if (f.type === 'sendSignal') return this.sendSignal(accountId, engine, Number(f.command), f.data ?? {})
    if (f.type === 'request' && f.command === 'getAliasName') {
      const noisedId = String(f.data?.noisedId ?? '')
      const aliasName = this.threads.profile(accountId, noisedId)?.name ?? ''
      queueMicrotask(() => engine.onZaloFrame({ type: 'response', command: 'getAliasName', data: { noisedId, aliasName } }))
    }
  }

  private sendSignal(accountId: string, engine: EngineCore, command: number, payload: SignalData) {
    const signal = SIGNALS[command]
    if (!signal) return logger.warn('call: unsupported signal', { accountId, command })
    const session = this.sessions.get(accountId)!
    session.queue = session.queue.then(async () => {
      try {
        const imei = this.zalo.getApi(accountId)?.getContext().imei ?? ''
        const data = await this.zalo.voicecall(accountId, signal[0], signal[1](payload, imei))
        engine.onZaloFrame({ type: 'recvSignal', command, data })
      } catch (err) {
        logger.warn('call: signal failed', { accountId, command, err })
      }
    })
  }
}
