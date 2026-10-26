import { EventEmitter } from 'node:events'

export type CameraProfile = { width: number; height: number; fps: number; bitrate: number; keyMs: number }
export type MediaEvent =
  | { type: 'camera-started' }
  | { type: 'fault'; kind: 'mic' | 'speaker' | 'camera'; why: string }
  | { type: 'log'; line: string }
type Sock = { send(data: string | Uint8Array): unknown; close(): unknown }
type Events = { audio: [frame: Buffer]; camera: [key: boolean, data: Buffer]; event: [e: MediaEvent]; up: []; down: [] }

export const mediaMode = () => process.env.ZCALL_MEDIA ?? (process.platform === 'win32' ? 'app' : 'python')

export class MediaLink extends EventEmitter<Events> {
  private sock: Sock | null = null
  private audioArgs: string[] | null = null
  private audioState = new Map<number, Buffer>()
  private camera: CameraProfile | null = null

  get connected() {
    return this.sock !== null
  }

  attach(sock: Sock) {
    this.sock?.close()
    this.sock = sock
    if (this.audioArgs) {
      this.sendJson({ type: 'audio-start', args: this.audioArgs })
      for (const frame of this.audioState.values()) sock.send(frame)
    }
    if (this.camera) this.sendJson({ type: 'camera-start', profile: this.camera })
    this.emit('up')
  }

  detach(sock: Sock) {
    if (this.sock !== sock) return
    this.sock = null
    this.emit('down')
  }

  receive(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') {
      try {
        this.emit('event', JSON.parse(data) as MediaEvent)
      } catch {}
      return
    }
    const b = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)
    if (b[0] === 0x4c) this.emit('audio', b)
    else if (b[0] === 0x43 && b.length > 2) this.emit('camera', b[1] === 1, b.subarray(2))
  }

  send(frame: Uint8Array) {
    this.sock?.send(frame)
  }

  sendJson(m: object) {
    this.sock?.send(JSON.stringify(m))
  }

  startAudio(args: string[]) {
    this.audioArgs = args
    this.audioState.clear()
    this.sendJson({ type: 'audio-start', args })
  }

  audioControl(frame: Buffer) {
    this.audioState.set(frame[0]!, frame)
    this.send(frame)
  }

  stopAudio() {
    this.audioArgs = null
    this.audioState.clear()
    this.sendJson({ type: 'audio-stop' })
  }

  startCamera(profile: CameraProfile) {
    this.camera = profile
    this.sendJson({ type: 'camera-start', profile })
  }

  cameraProfile(profile: CameraProfile) {
    this.camera = profile
    this.sendJson({ type: 'camera-profile', profile })
  }

  stopCamera() {
    this.camera = null
    this.sendJson({ type: 'camera-stop' })
  }
}

export const mediaLink = new MediaLink()

type CameraEvents = { frame: (f: { key: boolean; data: Buffer }) => void; started: () => void; failed: (why: string) => void }

export class AppCamera {
  private active = false
  private onFrame = (key: boolean, data: Buffer) => this.on.frame({ key, data })
  private onEvent = (e: MediaEvent) => {
    if (e.type === 'camera-started') this.on.started()
    else if (e.type === 'fault' && e.kind === 'camera') this.fail(e.why)
  }
  private onDown = () => this.fail('mất kết nối tới app')

  constructor(
    private on: CameraEvents,
    private link = mediaLink,
  ) {}

  get running() {
    return this.active
  }

  start(p: CameraProfile) {
    this.stop()
    this.active = true
    this.link.on('camera', this.onFrame).on('event', this.onEvent).on('down', this.onDown)
    this.link.startCamera(p)
    if (!this.link.connected) this.fail('app chưa nối tới server')
  }

  setProfile(p: CameraProfile) {
    if (this.active) this.link.cameraProfile(p)
  }

  requestKey() {
    if (this.active) this.link.sendJson({ type: 'camera-key' })
  }

  stop() {
    if (!this.active) return
    this.active = false
    this.link.off('camera', this.onFrame).off('event', this.onEvent).off('down', this.onDown)
    this.link.stopCamera()
  }

  private fail(why: string) {
    if (!this.active) return
    this.stop()
    this.on.failed(why)
  }
}
