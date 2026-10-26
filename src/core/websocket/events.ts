import type { ServerEvent } from "@/shared/types"
import { baseUrl, token } from "@/core/http/api"
import { queryClient } from "@/core/http/query-client"
import { qk } from "@/shared/constants/api.constants"

const invalidate = (queryKey: unknown[]) => queryClient.invalidateQueries({ queryKey })

function handle(e: ServerEvent) {
  switch (e.type) {
    case "account":
      return invalidate(qk.accounts)
    case "threads":
      return invalidate(qk.threads)
    case "message":
      invalidate(qk.threads)
      return invalidate(qk.messages(e.message.account_id, e.message.thread_id))
    case "undo":
      return invalidate(qk.messages(e.accountId))
    case "reaction":
      return invalidate(qk.messages(e.accountId, e.threadId))
    case "qr-done":
      invalidate(qk.accounts)
      return queryClient.setQueryData(qk.loginQr, e)
    case "qr":
    case "qr-scanned":
    case "qr-failed":
      return queryClient.setQueryData(qk.loginQr, e)
  }
}

export function connectEvents() {
  const ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`)
  ws.onopen = () => queryClient.invalidateQueries()
  ws.onmessage = (m) => handle(JSON.parse(m.data))
  ws.onclose = () => setTimeout(connectEvents, 1000)
}
