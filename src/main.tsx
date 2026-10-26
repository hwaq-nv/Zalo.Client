import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { App } from "@/app"
import { CallWindow } from "@/app/call"
import { FileViewerWindow } from "@/app/file-viewer"
import { sendCallAction, connectCalls } from "@/app/call/services/call.service"
import { useCallStore } from "@/app/call/stores/call.store"
import { connectEvents } from "@/core/websocket/events"
import { Providers } from "@/providers"
import { initTheme } from "@/shared/stores/theme.store"
import { initSettings } from "@/app/settings/stores/settings.store"
import "./index.css"

const win = getCurrentWindow()
const isCallWindow = win.label === "call"
const isViewer = win.label === "viewer"

initTheme()
if (!isViewer) connectCalls()
if (isCallWindow) {
  useCallStore.subscribe((s, p) => {
    if (p.call && !s.call) win.destroy()
  })
  win.onCloseRequested((e) => {
    const c = useCallStore.getState().call
    if (!c) return
    e.preventDefault()
    sendCallAction(c.accountId, { action: "hangup" })
  })
} else if (!isViewer) {
  connectEvents()
  initSettings()
  useCallStore.subscribe((s, p) => {
    if (s.call && !p.call) invoke("open_call_window", { title: s.call.state.name }).catch(console.warn)
  })
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isViewer ? (
      <Providers>
        <FileViewerWindow />
      </Providers>
    ) : isCallWindow ? (
      <Providers>
        <CallWindow />
      </Providers>
    ) : (
      <App />
    )}
  </StrictMode>,
)
