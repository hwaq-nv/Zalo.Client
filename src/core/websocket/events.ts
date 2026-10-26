import type { ServerEvent } from "@/shared/types"
import { baseUrl, token } from "@/core/http/api"
import { queryClient } from "@/core/http/query-client"
import { queryKeys } from "@/shared/constants/api.constants"

const invalidate = (queryKey: unknown[]) => queryClient.invalidateQueries({ queryKey })

function handleServerEvent(e: ServerEvent) {
  switch (e.type) {
    case "account":
      return invalidate(queryKeys.accounts)
    case "threads":
      return invalidate(queryKeys.threads)
    case "message":
      invalidate(queryKeys.threads)
      return invalidate(queryKeys.messages(e.message.account_id, e.message.thread_id))
    case "undo":
      return invalidate(queryKeys.messages(e.accountId))
    case "reaction":
      return invalidate(queryKeys.messages(e.accountId, e.threadId))
    case "qr-done":
      invalidate(queryKeys.accounts)
      return queryClient.setQueryData(queryKeys.loginQr, e)
    case "qr":
    case "qr-scanned":
    case "qr-failed":
      return queryClient.setQueryData(queryKeys.loginQr, e)
  }
}

export function connectEvents() {
  const ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`)
  ws.onopen = () => queryClient.invalidateQueries()
  ws.onmessage = (m) => handleServerEvent(JSON.parse(m.data))
  ws.onclose = () => setTimeout(connectEvents, 1000)
}
