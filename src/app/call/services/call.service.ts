import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import type { CallMessage, CallVideo } from "@/shared/types"
import { baseUrl, token } from "@/core/http/api"
import { ENDED_MS, ENDED_TOAST } from "@/app/call/constants/call.constants"
import type { CallCommand, EncodedFrame } from "@/app/call/models/call.model"
import { useCallStore } from "@/app/call/stores/call.store"

export const showEnded = (name: string, text: string) => toast(name, { id: ENDED_TOAST, description: text, duration: ENDED_MS })

const viewers = new Map<string, (f: EncodedFrame) => void>()

export function watchVideo(accountId: string, src: string, cb: (f: EncodedFrame) => void) {
  const key = `${accountId}:${src}`
  viewers.set(key, cb)
  return () => {
    if (viewers.get(key) === cb) viewers.delete(key)
  }
}

function handle(m: CallMessage) {
  const { call } = useCallStore.getState()
  switch (m.type) {
    case "state":
      if (!call) toast.dismiss(ENDED_TOAST)
      return useCallStore.setState({ call: { accountId: m.accountId, state: m.state } })
    case "close":
      if (call?.accountId !== m.accountId) return
      useCallStore.setState({ call: undefined, speaking: {} })
      return showEnded(call.state.name, m.text)
    case "speaking":
      return useCallStore.setState((s) => ({ speaking: { ...s.speaking, [m.src]: m.on } }))
  }
}

const utf8 = new TextDecoder()

function receiveVideo(buf: ArrayBuffer) {
  const b = new Uint8Array(buf)
  const nl = b.indexOf(10)
  const head = JSON.parse(utf8.decode(b.subarray(0, nl))) as CallVideo
  viewers.get(`${head.accountId}:${head.src}`)?.({ key: head.key, data: b.subarray(nl + 1) })
}

let ws: WebSocket | undefined

export function connectCalls() {
  invoke("media_connect", { url: baseUrl, token }).catch(console.warn)
  ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/calls/ws?token=${encodeURIComponent(token)}`)
  ws.binaryType = "arraybuffer"
  ws.onmessage = (m) => (typeof m.data === "string" ? handle(JSON.parse(m.data)) : receiveVideo(m.data))
  ws.onclose = () => {
    useCallStore.setState({ call: undefined })
    setTimeout(connectCalls, 1000)
  }
}

export const callAction = (accountId: string, c: CallCommand) => ws?.send(JSON.stringify({ accountId, ...c }))
