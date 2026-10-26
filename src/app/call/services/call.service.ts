import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import type { CallMessage, CallVideo } from "@/shared/types"
import { baseUrl, token } from "@/core/http/api"
import { CALL_ENDED_TOAST_DURATION, CALL_ENDED_TOAST_ID } from "@/app/call/constants/call.constants"
import type { CallCommand, EncodedFrame } from "@/app/call/models/call.model"
import { useCallStore } from "@/app/call/stores/call.store"

export const showCallEndedToast = (name: string, text: string) => toast(name, { id: CALL_ENDED_TOAST_ID, description: text, duration: CALL_ENDED_TOAST_DURATION })

const videoListeners = new Map<string, (f: EncodedFrame) => void>()

export function subscribeVideo(accountId: string, src: string, cb: (f: EncodedFrame) => void) {
  const key = `${accountId}:${src}`
  videoListeners.set(key, cb)
  return () => {
    if (videoListeners.get(key) === cb) videoListeners.delete(key)
  }
}

function handleCallMessage(m: CallMessage) {
  const { call } = useCallStore.getState()
  switch (m.type) {
    case "state":
      if (!call) toast.dismiss(CALL_ENDED_TOAST_ID)
      return useCallStore.setState({ call: { accountId: m.accountId, state: m.state } })
    case "close":
      if (call?.accountId !== m.accountId) return
      useCallStore.setState({ call: undefined, speaking: {} })
      return showCallEndedToast(call.state.name, m.text)
    case "speaking":
      return useCallStore.setState((s) => ({ speaking: { ...s.speaking, [m.src]: m.on } }))
  }
}

const textDecoder = new TextDecoder()

function handleVideoFrame(buf: ArrayBuffer) {
  const b = new Uint8Array(buf)
  const nl = b.indexOf(10)
  const head = JSON.parse(textDecoder.decode(b.subarray(0, nl))) as CallVideo
  videoListeners.get(`${head.accountId}:${head.src}`)?.({ key: head.key, data: b.subarray(nl + 1) })
}

let ws: WebSocket | undefined

export function connectCalls() {
  invoke("media_connect", { url: baseUrl, token }).catch(console.warn)
  ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/calls/ws?token=${encodeURIComponent(token)}`)
  ws.binaryType = "arraybuffer"
  ws.onmessage = (m) => (typeof m.data === "string" ? handleCallMessage(JSON.parse(m.data)) : handleVideoFrame(m.data))
  ws.onclose = () => {
    useCallStore.setState({ call: undefined })
    setTimeout(connectCalls, 1000)
  }
}

export const sendCallAction = (accountId: string, c: CallCommand) => ws?.send(JSON.stringify({ accountId, ...c }))
