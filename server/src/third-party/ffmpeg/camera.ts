import { spawn, type ChildProcess } from 'node:child_process'
import { nalUnits } from '../zcall/native-engine/video'

export type EncodeProfile = { width: number; height: number; fps: number; bitrate: number; keyMs: number }
export type EncodedFrame = { key: boolean; data: Buffer }

export const DEFAULT_PROFILE: EncodeProfile = { width: 640, height: 360, fps: 15, bitrate: 500_000, keyMs: 1000 }

const START = Buffer.from([0, 0, 0, 1])
const AUD = Buffer.from([0, 0, 0, 1, 9])
const INPUTS = [['-input_format', 'mjpeg'], []]

const nalType = (n: Uint8Array) => n[0]! & 31

const MAX_KEY_MS = 2000

export class AnnexBFrames {
  private buf = Buffer.alloc(0)

  push(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk])
    const out: EncodedFrame[] = []
    for (let next = this.buf.indexOf(AUD, 1); next > 0; next = this.buf.indexOf(AUD, 1)) {
      const nals = nalUnits(this.buf.subarray(0, next)).filter((n) => nalType(n) !== 6 && nalType(n) !== 9)
      this.buf = this.buf.subarray(next)
      if (nals.length) out.push({ key: nals.some((n) => nalType(n) === 5), data: Buffer.concat(nals.flatMap((n) => [START, n])) })
    }
    return out
  }
}

export const x264Args = (p: EncodeProfile) => {
  const keyint = Math.max(1, Math.round((p.fps * Math.min(p.keyMs, MAX_KEY_MS)) / 1000))
  return [
    '-vf', `fps=${p.fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=increase,crop=${p.width}:${p.height}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
    '-b:v', `${p.bitrate}`, '-maxrate', `${p.bitrate}`, '-bufsize', `${p.bitrate}`,
    '-x264-params', `keyint=${keyint}:min-keyint=${keyint}:scenecut=0:threads=1:repeat-headers=1:aud=1`,
    '-f', 'h264', '-',
  ]
}

const CAPTURE = { width: 1280, height: 720, fps: 24 }
const FRAME_BYTES = (CAPTURE.width * CAPTURE.height * 3) / 2
const MAX_PENDING_FRAMES = 2

export class Camera {
  private capture: ChildProcess | null = null
  private encoders: ChildProcess[] = []
  private released = Promise.resolve()
  private run = 0
  private runs = 0
  private sent = 0
  private profile = DEFAULT_PROFILE

  constructor(private on: { frame: (f: EncodedFrame) => void; started: () => void; failed: (why: string) => void }) {}

  get running() {
    return this.run !== 0
  }

  start(p: EncodeProfile) {
    this.stop()
    this.profile = p
    this.sent = 0
    const run = (this.run = ++this.runs)
    void this.released.then(() => this.run === run && this.spawnCapture(0, run))
  }

  setProfile(p: EncodeProfile) {
    this.profile = p
    if (this.capture && this.encoders.length) this.spawnEncoder(this.run)
  }

  stop() {
    this.run = 0
    this.capture?.kill()
    this.capture = null
    for (const e of this.encoders) e.kill()
    this.encoders = []
  }

  private fail(run: number, why: string) {
    if (this.run !== run) return
    this.stop()
    this.on.failed(why)
  }

  private spawnCapture(input: number, run: number) {
    const { width: w, height: h, fps } = CAPTURE
    const device = process.env.ZCALL_CAMERA || '/dev/video0'
    const cap = spawn(
      'ffmpeg',
      ['-loglevel', 'error', '-f', 'v4l2', ...INPUTS[input]!, '-i', device,
        '-vf', `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    this.capture = cap
    this.released = new Promise((resolve) => cap.on('exit', () => resolve()).on('error', () => resolve()))
    let parts: Buffer[] = []
    let size = 0
    let got = false
    let err = ''
    cap.stderr!.on('data', (d) => (err = (err + d).slice(-300)))
    cap.stdout!.on('data', (chunk: Buffer) => {
      if (this.run !== run) return
      parts.push(chunk)
      size += chunk.length
      while (size >= FRAME_BYTES) {
        const all = Buffer.concat(parts, size)
        const frame = all.subarray(0, FRAME_BYTES)
        parts = size > FRAME_BYTES ? [all.subarray(FRAME_BYTES)] : []
        size -= FRAME_BYTES
        if (!got) {
          got = true
          this.spawnEncoder(run)
        }
        for (const e of this.encoders) if (e.stdin!.writableLength < FRAME_BYTES * MAX_PENDING_FRAMES) e.stdin!.write(frame)
      }
    })
    cap.on('error', (e) => this.fail(run, `ffmpeg: ${e.message}`))
    cap.on('exit', (code) => {
      if (this.run === run && !got && input + 1 < INPUTS.length) return this.spawnCapture(input + 1, run)
      this.fail(run, err.trim() || `ffmpeg exited with ${code}`)
    })
  }

  private spawnEncoder(run: number) {
    const { width: w, height: h, fps } = CAPTURE
    const enc = spawn(
      'ffmpeg',
      ['-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${w}x${h}`, '-r', `${fps}`, '-i', '-', ...x264Args(this.profile)],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    this.encoders.push(enc)
    const frames = new AnnexBFrames()
    let err = ''
    enc.stdin!.on('error', () => {})
    enc.stderr!.on('data', (d) => (err = (err + d).slice(-300)))
    enc.stdout!.on('data', (chunk: Buffer) => {
      for (const f of frames.push(chunk)) {
        const i = this.encoders.indexOf(enc)
        if (this.run !== run || i < 0) return
        for (const old of this.encoders.splice(0, i)) old.kill()
        if (this.sent++ === 0) this.on.started()
        this.on.frame(f)
      }
    })
    enc.on('error', (e) => this.fail(run, `ffmpeg: ${e.message}`))
    enc.on('exit', (code) => this.encoders.includes(enc) && this.fail(run, err.trim() || `ffmpeg exited with ${code}`))
  }
}
