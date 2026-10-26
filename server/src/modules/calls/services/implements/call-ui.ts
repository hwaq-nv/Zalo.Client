import { Camera, DEFAULT_PROFILE, type EncodedFrame, type EncodeProfile } from '../../../../third-party/ffmpeg/camera'
import { AppCamera, mediaLink, mediaMode } from '../../../../third-party/zcall/native-engine/audio-link'
import type { CallMember, CallMessage, CallState } from '../../../../types'
import type { CallAction } from '../../dtos/requests/call.request'

type RawMember = { src: string | number; name?: string; avatar?: string; muted?: boolean; camOff?: boolean; state?: string }
type CallInfo = { title?: string; text?: string; avatar?: string; video?: boolean; group?: boolean; noAnswer?: boolean; members?: RawMember[] }
type CallOutput = { message: (m: CallMessage) => void; video: (src: string, key: boolean, data: Uint8Array) => void }
type CallCamera = Pick<Camera, 'running' | 'start' | 'setProfile' | 'stop'> & { requestKey?(): void }

const EMPTY_STATE = {
  since: 0, video: false, group: false, noAnswer: false, muted: false, speakerOff: false, camera: false,
  peerCamOff: false, peerMuted: false, notice: '', members: [],
} satisfies Partial<CallState>

const normalizeMembers = (list: RawMember[] = []): CallMember[] =>
  list.map((m) => ({ src: String(m.src), name: m.name ?? '', avatar: m.avatar ?? '', muted: !!m.muted, camOff: !!m.camOff, state: m.state ?? '' }))

const normalizeProfile = (profile: Partial<EncodeProfile>): EncodeProfile => ({
  width: (profile.width ?? 0) & ~1 || DEFAULT_PROFILE.width,
  height: (profile.height ?? 0) & ~1 || DEFAULT_PROFILE.height,
  fps: profile.fps! > 0 ? profile.fps! : DEFAULT_PROFILE.fps,
  bitrate: profile.bitrate! > 0 ? profile.bitrate! : DEFAULT_PROFILE.bitrate,
  keyMs: profile.keyMs! > 0 ? profile.keyMs! : DEFAULT_PROFILE.keyMs,
})

// Thay cửa sổ gọi của zalo-for-linux (native-engine/ui-client.js): engine gọi đúng các hàm này. Trạng thái và video
// ra WS /calls, thao tác vào qua action(). Camera quay bằng ffmpeg vì webview Tauri không encode H.264 được
export class CallUi {
  state: CallState | null = null
  // Gọi đi: theo loại cuộc gọi; gọi đến: theo nút trả lời
  wantCamera = false
  private incomingCallbacks: { accept: (camStartOff: boolean) => void; reject: (why: string) => void } | null = null
  private callbacks = {
    hangup: () => {},
    mute: (_on: boolean) => {},
    speaker: (_on: boolean) => {},
    camera: (_on: boolean) => {},
    videoFrame: (_f: EncodedFrame & { screen: boolean; w: number; h: number }) => {},
    tile: (_src: number, _width: number) => {},
    needKey: (_why: string, _src?: number) => {},
  }
  private camera: CallCamera
  private profile = DEFAULT_PROFILE

  constructor(
    private accountId: string,
    private output: CallOutput,
    private log: (msg: string) => void,
  ) {
    const cameraEvents = {
      started: () => this.callbacks.camera(true),
      frame: (f: EncodedFrame) => {
        this.callbacks.videoFrame({ ...f, screen: false, w: this.profile.width, h: this.profile.height })
        this.output.video('self', f.key, f.data)
      },
      failed: (why: string) => {
        this.log(`camera: ${why}`)
        this.wantCamera = false
        this.callbacks.camera(false)
        this.notice('Không mở được camera')
      },
    }
    this.camera = mediaMode() === 'app' ? new AppCamera(cameraEvents) : new Camera(cameraEvents)
    mediaLink.on('up', () => this.notice(''))
  }

  // ---- engine → ui ----
  onHangup(cb: () => void) { this.callbacks.hangup = cb }
  onMute(cb: (on: boolean) => void) { this.callbacks.mute = cb }
  onSpeaker(cb: (on: boolean) => void) { this.callbacks.speaker = cb }
  onCamera(cb: (on: boolean) => void) { this.callbacks.camera = cb }
  onVideoFrame(cb: CallUi['callbacks']['videoFrame']) { this.callbacks.videoFrame = cb }
  onTile(cb: (src: number, width: number) => void) { this.callbacks.tile = cb }
  onNeedKey(cb: (why: string, src?: number) => void) { this.callbacks.needKey = cb }

  open({ title = '', text = '', avatar = '', video = false, group = false, members }: CallInfo) {
    this.incomingCallbacks = null
    this.setState({ ...EMPTY_STATE, phase: 'outgoing', name: title, avatar, text, video, group, members: normalizeMembers(members) })
  }

  incoming(info: CallInfo, accept: (camStartOff: boolean) => void, reject: (why: string) => void) {
    this.incomingCallbacks = { accept, reject }
    this.setState({
      ...EMPTY_STATE, phase: 'incoming', name: info.title ?? '', avatar: info.avatar ?? '', text: info.text ?? '',
      video: !!info.video, group: !!info.group, noAnswer: !!info.noAnswer, members: normalizeMembers(info.members),
    })
  }

  status(text: string, since = 0) {
    const state = this.state
    if (!state) return
    const phase = since ? 'connected' : state.phase === 'incoming' ? 'connecting' : state.phase
    // Nối xong mà camera đang tắt: báo bên kia, như cửa sổ gọi của zalo-for-linux
    if (phase === 'connected' && state.phase !== 'connected' && (state.video || state.group) && !this.wantCamera) this.callbacks.camera(false)
    this.setState({ ...state, phase, text, since })
  }

  notice(text: string) {
    if (this.state) this.setState({ ...this.state, notice: text })
  }

  peer({ camOff, muted }: { camOff?: boolean; muted?: boolean }) {
    if (this.state) this.setState({ ...this.state, peerCamOff: !!camOff, peerMuted: !!muted })
  }

  rename(name: string) {
    if (this.state && name) this.setState({ ...this.state, name })
  }

  members(list: RawMember[]) {
    if (this.state) this.setState({ ...this.state, members: normalizeMembers(list) })
  }

  speaking(src: number, on: boolean) {
    this.output.message({ type: 'speaking', accountId: this.accountId, src: String(src), on: !!on })
  }

  video({ key, data, src }: { key: boolean; data: Uint8Array; src?: number }) {
    this.output.video(src === undefined ? 'peer' : String(src), key, data)
  }

  setCameraEncode(profile: Partial<EncodeProfile>) {
    const next = normalizeProfile(profile)
    if (JSON.stringify(next) === JSON.stringify(this.profile)) return
    this.profile = next
    this.camera.setProfile(next)
  }

  // Camera (ffmpeg) không ép được key frame, ra đều theo keyMs
  requestKeyFrame() {
    this.camera.requestKey?.()
  }

  close(text: string) {
    this.incomingCallbacks = null
    this.state = null
    this.wantCamera = false
    this.camera.stop()
    this.profile = DEFAULT_PROFILE
    this.output.message({ type: 'close', accountId: this.accountId, text: text || '' })
  }

  // ---- người dùng → engine ----
  action({ action, on, src, width }: CallAction) {
    const state = this.state
    if (!state) return
    const incoming = this.incomingCallbacks
    switch (action) {
      case 'accept':
        if (!incoming) return
        this.incomingCallbacks = null
        this.wantCamera = on
        return incoming.accept(!on)
      case 'reject':
      case 'hangup':
        if (incoming) {
          this.incomingCallbacks = null
          return incoming.reject('reject')
        }
        if (action === 'hangup') this.callbacks.hangup()
        return
      case 'mute':
        this.setState({ ...state, muted: on })
        return this.callbacks.mute(on)
      case 'speaker':
        this.setState({ ...state, speakerOff: on })
        return this.callbacks.speaker(on)
      case 'camera':
        this.wantCamera = on
        if (!on) this.callbacks.camera(false)
        return this.setState({ ...state, notice: '' })
      case 'tile':
        return this.callbacks.tile(Number(src) >>> 0, width)
      case 'needkey':
        return this.callbacks.needKey('window', src && src !== 'peer' ? Number(src) : undefined)
    }
  }

  private setState(state: CallState) {
    this.state = { ...state, camera: this.wantCamera }
    const shouldUseCamera = (state.video || state.group) && state.phase !== 'incoming' && this.wantCamera
    if (shouldUseCamera && !this.camera.running) this.camera.start(this.profile)
    if (!shouldUseCamera && this.camera.running) this.camera.stop()
    this.output.message({ type: 'state', accountId: this.accountId, state: this.state })
  }
}
