import type { ServerEvent } from "@/shared/types"
import { baseUrl, token } from "@/core/http/api"
import { queryClient } from "@/core/http/query-client"
import { queryKeys } from "@/shared/constants/api.constants"

const invalidate = (queryKey: unknown[]) => queryClient.invalidateQueries({ queryKey })

type TypingEvent = Extract<ServerEvent, { type: "typing" }>
// Zalo gửi typing lặp lại khi người kia còn gõ; im lâu hơn mức này thì coi như thôi
const TYPING_TTL_MS = 6000

function handleServerEvent(e: ServerEvent) {
  switch (e.type) {
    case "account":
      return invalidate(queryKeys.accounts)
    case "threads":
      invalidate(queryKeys.threads)
      // Hồ sơ (tên, ảnh) vừa lấy về cũng hiện ở khung chat
      return invalidate(queryKeys.messages(e.accountId))
    case "message":
      invalidate(queryKeys.threads)
      // Người đang soạn đã gửi xong
      queryClient.setQueryData<TypingEvent | null>(queryKeys.typing(e.message.account_id, e.message.thread_id), (t) =>
        t?.userId === e.message.from_id ? null : t,
      )
      return invalidate(queryKeys.messages(e.message.account_id, e.message.thread_id))
    case "receipt":
      return invalidate(queryKeys.receipts(e.accountId, e.threadId))
    case "typing": {
      const key = queryKeys.typing(e.accountId, e.threadId)
      queryClient.setQueryData(key, e)
      setTimeout(() => queryClient.setQueryData<TypingEvent | null>(key, (t) => (t === e ? null : t)), TYPING_TTL_MS)
      return
    }
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
