import { spawn, type ChildProcess } from 'node:child_process'
import { nalUnits } from '../zcall/native-engine/video'

export type EncodeProfile = { width: number; height: number; fps: number; bitrate: number; keyMs: number }
export type EncodedFrame = { key: boolean; data: Buffer }

export const DEFAULT_PROFILE: EncodeProfile = { width: 640, height: 360, fps: 15, bitrate: 500_000, keyMs: 1000 }

const START_CODE = Buffer.from([0, 0, 0, 1])
const AUD_START_CODE = Buffer.from([0, 0, 0, 1, 9])
const CAPTURE_INPUT_ARGS = [['-input_format', 'mjpeg'], []]

const getNalType = (n: Uint8Array) => n[0]! & 31

const MAX_KEYFRAME_INTERVAL_MS = 2000

export class AnnexBFrameSplitter {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const out: EncodedFrame[] = []
    for (let next = this.buffer.indexOf(AUD_START_CODE, 1); next > 0; next = this.buffer.indexOf(AUD_START_CODE, 1)) {
      const nals = nalUnits(this.buffer.subarray(0, next)).filter((n) => getNalType(n) !== 6 && getNalType(n) !== 9)
      this.buffer = this.buffer.subarray(next)
      if (nals.length) out.push({ key: nals.some((n) => getNalType(n) === 5), data: Buffer.concat(nals.flatMap((n) => [START_CODE, n])) })
    }
    return out
  }
}

export const buildX264Args = (profile: EncodeProfile) => {
  const keyint = Math.max(1, Math.round((profile.fps * Math.min(profile.keyMs, MAX_KEYFRAME_INTERVAL_MS)) / 1000))
  return [
    '-vf', `fps=${profile.fps},scale=${profile.width}:${profile.height}:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
    '-b:v', `${profile.bitrate}`, '-maxrate', `${profile.bitrate}`, '-bufsize', `${profile.bitrate}`,
    '-x264-params', `keyint=${keyint}:min-keyint=${keyint}:scenecut=0:threads=1:repeat-headers=1:aud=1`,
    '-f', 'h264', '-',
  ]
}

const CAPTURE_FORMAT = { width: 1280, height: 720, fps: 24 }
const RAW_FRAME_BYTES = (CAPTURE_FORMAT.width * CAPTURE_FORMAT.height * 3) / 2
const MAX_PENDING_FRAMES = 2

export class Camera {
  private capture: ChildProcess | null = null
  private encoders: ChildProcess[] = []
  private released = Promise.resolve()
  private currentRun = 0
  private runCount = 0
  private sentFrames = 0
  private profile = DEFAULT_PROFILE

  constructor(private handlers: { frame: (f: EncodedFrame) => void; started: () => void; failed: (why: string) => void }) {}

  get running() {
    return this.currentRun !== 0
  }

  start(profile: EncodeProfile) {
    this.stop()
    this.profile = profile
    this.sentFrames = 0
    const run = (this.currentRun = ++this.runCount)
    void this.released.then(() => this.currentRun === run && this.spawnCapture(0, run))
  }

  setProfile(profile: EncodeProfile) {
    this.profile = profile
    if (this.capture && this.encoders.length) this.spawnEncoder(this.currentRun)
  }

  stop() {
    this.currentRun = 0
    this.capture?.kill()
    this.capture = null
    for (const encoder of this.encoders) encoder.kill()
    this.encoders = []
  }

  private handleFailure(run: number, why: string) {
    if (this.currentRun !== run) return
    this.stop()
    this.handlers.failed(why)
  }

  private spawnCapture(input: number, run: number) {
    const { width, height, fps } = CAPTURE_FORMAT
    const device = process.env.ZCALL_CAMERA || '/dev/video0'
    const captureProcess = spawn(
      'ffmpeg',
      ['-loglevel', 'error', '-f', 'v4l2', ...CAPTURE_INPUT_ARGS[input]!, '-i', device,
        '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    this.capture = captureProcess
    this.released = new Promise((resolve) => captureProcess.on('exit', () => resolve()).on('error', () => resolve()))
    let parts: Buffer[] = []
    let size = 0
    let hasFrame = false
    let stderrTail = ''
    captureProcess.stderr!.on('data', (d) => (stderrTail = (stderrTail + d).slice(-300)))
    captureProcess.stdout!.on('data', (chunk: Buffer) => {
      if (this.currentRun !== run) return
      parts.push(chunk)
      size += chunk.length
      while (size >= RAW_FRAME_BYTES) {
        const all = Buffer.concat(parts, size)
        const frame = all.subarray(0, RAW_FRAME_BYTES)
        parts = size > RAW_FRAME_BYTES ? [all.subarray(RAW_FRAME_BYTES)] : []
        size -= RAW_FRAME_BYTES
        if (!hasFrame) {
          hasFrame = true
          this.spawnEncoder(run)
        }
        for (const encoder of this.encoders) if (encoder.stdin!.writableLength < RAW_FRAME_BYTES * MAX_PENDING_FRAMES) encoder.stdin!.write(frame)
      }
    })
    captureProcess.on('error', (e) => this.handleFailure(run, `ffmpeg: ${e.message}`))
    captureProcess.on('exit', (code) => {
      if (this.currentRun === run && !hasFrame && input + 1 < CAPTURE_INPUT_ARGS.length) return this.spawnCapture(input + 1, run)
      this.handleFailure(run, stderrTail.trim() || `ffmpeg exited with ${code}`)
    })
  }

  private spawnEncoder(run: number) {
    const { width, height, fps } = CAPTURE_FORMAT
    const encoder = spawn(
      'ffmpeg',
      ['-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${width}x${height}`, '-r', `${fps}`, '-i', '-', ...buildX264Args(this.profile)],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    this.encoders.push(encoder)
    const frames = new AnnexBFrameSplitter()
    let stderrTail = ''
    encoder.stdin!.on('error', () => {})
    encoder.stderr!.on('data', (d) => (stderrTail = (stderrTail + d).slice(-300)))
    encoder.stdout!.on('data', (chunk: Buffer) => {
      for (const f of frames.push(chunk)) {
        const index = this.encoders.indexOf(encoder)
        if (this.currentRun !== run || index < 0) return
        for (const old of this.encoders.splice(0, index)) old.kill()
        if (this.sentFrames++ === 0) this.handlers.started()
        this.handlers.frame(f)
      }
    })
    encoder.on('error', (e) => this.handleFailure(run, `ffmpeg: ${e.message}`))
    encoder.on('exit', (code) => this.encoders.includes(encoder) && this.handleFailure(run, stderrTail.trim() || `ffmpeg exited with ${code}`))
  }
}
