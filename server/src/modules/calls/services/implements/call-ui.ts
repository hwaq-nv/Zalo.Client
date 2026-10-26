import { Camera, DEFAULT_PROFILE, type EncodedFrame, type EncodeProfile } from '../../../../third-party/ffmpeg/camera'
import { AppCamera, mediaLink, mediaMode } from '../../../../third-party/zcall/native-engine/audio-link'
import type { CallMember, CallMessage, CallState } from '../../../../types'
import type { CallAction } from '../../dtos/requests/call.request'

type RawMember = { src: string | number; name?: string; avatar?: string; muted?: boolean; camOff?: boolean; state?: string }
type Opened = { title?: string; text?: string; avatar?: string; video?: boolean; group?: boolean; noAnswer?: boolean; members?: RawMember[] }
type Out = { message: (m: CallMessage) => void; video: (src: string, key: boolean, data: Uint8Array) => void }
type CallCamera = Pick<Camera, 'running' | 'start' | 'setProfile' | 'stop'> & { requestKey?(): void }

const BLANK = {
  since: 0, video: false, group: false, noAnswer: false, muted: false, speakerOff: false, camera: false,
  peerCamOff: false, peerMuted: false, notice: '', members: [],
} satisfies Partial<CallState>

const toMembers = (list: RawMember[] = []): CallMember[] =>
  list.map((m) => ({ src: String(m.src), name: m.name ?? '', avatar: m.avatar ?? '', muted: !!m.muted, camOff: !!m.camOff, state: m.state ?? '' }))

const toProfile = (p: Partial<EncodeProfile>): EncodeProfile => ({
  width: (p.width ?? 0) & ~1 || DEFAULT_PROFILE.width,
  height: (p.height ?? 0) & ~1 || DEFAULT_PROFILE.height,
  fps: p.fps! > 0 ? p.fps! : DEFAULT_PROFILE.fps,
  bitrate: p.bitrate! > 0 ? p.bitrate! : DEFAULT_PROFILE.bitrate,
  keyMs: p.keyMs! > 0 ? p.keyMs! : DEFAULT_PROFILE.keyMs,
})

// Thay cửa sổ gọi của zalo-for-linux (native-engine/ui-client.js): engine gọi đúng các hàm này. Trạng thái và video
// ra WS /calls, thao tác vào qua action(). Camera quay bằng ffmpeg vì webview Tauri không encode H.264 được
export class CallUi {
  state: CallState | null = null
  // Gọi đi: theo loại cuộc gọi; gọi đến: theo nút trả lời
  wantCamera = false
  private incomingCb: { accept: (camStartOff: boolean) => void; reject: (why: string) => void } | null = null
  private cb = {
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
    private out: Out,
    private log: (msg: string) => void,
  ) {
    const on = {
      started: () => this.cb.camera(true),
      frame: (f: EncodedFrame) => {
        this.cb.videoFrame({ ...f, screen: false, w: this.profile.width, h: this.profile.height })
        this.out.video('self', f.key, f.data)
      },
      failed: (why: string) => {
        this.log(`camera: ${why}`)
        this.wantCamera = false
        this.cb.camera(false)
        this.notice('Không mở được camera')
      },
    }
    this.camera = mediaMode() === 'app' ? new AppCamera(on) : new Camera(on)
    mediaLink.on('up', () => this.notice(''))
  }

  // ---- engine → ui ----
  onHangup(cb: () => void) { this.cb.hangup = cb }
  onMute(cb: (on: boolean) => void) { this.cb.mute = cb }
  onSpeaker(cb: (on: boolean) => void) { this.cb.speaker = cb }
  onCamera(cb: (on: boolean) => void) { this.cb.camera = cb }
  onVideoFrame(cb: CallUi['cb']['videoFrame']) { this.cb.videoFrame = cb }
  onTile(cb: (src: number, width: number) => void) { this.cb.tile = cb }
  onNeedKey(cb: (why: string, src?: number) => void) { this.cb.needKey = cb }

  open({ title = '', text = '', avatar = '', video = false, group = false, members }: Opened) {
    this.incomingCb = null
    this.set({ ...BLANK, phase: 'outgoing', name: title, avatar, text, video, group, members: toMembers(members) })
  }

  incoming(o: Opened, accept: (camStartOff: boolean) => void, reject: (why: string) => void) {
    this.incomingCb = { accept, reject }
    this.set({
      ...BLANK, phase: 'incoming', name: o.title ?? '', avatar: o.avatar ?? '', text: o.text ?? '',
      video: !!o.video, group: !!o.group, noAnswer: !!o.noAnswer, members: toMembers(o.members),
    })
  }

  status(text: string, since = 0) {
    const s = this.state
    if (!s) return
    const phase = since ? 'connected' : s.phase === 'incoming' ? 'connecting' : s.phase
    // Nối xong mà camera đang tắt: báo bên kia, như cửa sổ gọi của zalo-for-linux
    if (phase === 'connected' && s.phase !== 'connected' && (s.video || s.group) && !this.wantCamera) this.cb.camera(false)
    this.set({ ...s, phase, text, since })
  }

  notice(text: string) {
    if (this.state) this.set({ ...this.state, notice: text })
  }

  peer({ camOff, muted }: { camOff?: boolean; muted?: boolean }) {
    if (this.state) this.set({ ...this.state, peerCamOff: !!camOff, peerMuted: !!muted })
  }

  rename(name: string) {
    if (this.state && name) this.set({ ...this.state, name })
  }

  members(list: RawMember[]) {
    if (this.state) this.set({ ...this.state, members: toMembers(list) })
  }

  speaking(src: number, on: boolean) {
    this.out.message({ type: 'speaking', accountId: this.accountId, src: String(src), on: !!on })
  }

  video({ key, data, src }: { key: boolean; data: Uint8Array; src?: number }) {
    this.out.video(src === undefined ? 'peer' : String(src), key, data)
  }

  setCameraEncode(p: Partial<EncodeProfile>) {
    const next = toProfile(p)
    if (JSON.stringify(next) === JSON.stringify(this.profile)) return
    this.profile = next
    this.camera.setProfile(next)
  }

  // Camera (ffmpeg) không ép được key frame, ra đều theo keyMs
  requestKeyFrame() {
    this.camera.requestKey?.()
  }

  close(text: string) {
    this.incomingCb = null
    this.state = null
    this.wantCamera = false
    this.camera.stop()
    this.profile = DEFAULT_PROFILE
    this.out.message({ type: 'close', accountId: this.accountId, text: text || '' })
  }

  // ---- người dùng → engine ----
  action({ action, on, src, width }: CallAction) {
    const s = this.state
    if (!s) return
    const incoming = this.incomingCb
    switch (action) {
      case 'accept':
        if (!incoming) return
        this.incomingCb = null
        this.wantCamera = on
        return incoming.accept(!on)
      case 'reject':
      case 'hangup':
        if (incoming) {
          this.incomingCb = null
          return incoming.reject('reject')
        }
        if (action === 'hangup') this.cb.hangup()
        return
      case 'mute':
        this.set({ ...s, muted: on })
        return this.cb.mute(on)
      case 'speaker':
        this.set({ ...s, speakerOff: on })
        return this.cb.speaker(on)
      case 'camera':
        this.wantCamera = on
        if (!on) this.cb.camera(false)
        return this.set({ ...s, notice: '' })
      case 'tile':
        return this.cb.tile(Number(src) >>> 0, width)
      case 'needkey':
        return this.cb.needKey('window', src && src !== 'peer' ? Number(src) : undefined)
    }
  }

  private set(s: CallState) {
    this.state = { ...s, camera: this.wantCamera }
    const want = (s.video || s.group) && s.phase !== 'incoming' && this.wantCamera
    if (want && !this.camera.running) this.camera.start(this.profile)
    if (!want && this.camera.running) this.camera.stop()
    this.out.message({ type: 'state', accountId: this.accountId, state: this.state })
  }
}
