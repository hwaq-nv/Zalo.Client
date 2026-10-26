import { type FormEvent, useState } from "react"
import { Send } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import type { ThreadRow } from "@/shared/types"
import { useSend } from "@/app/chat/hooks/useMessages"
import { useAccounts, useReconnect } from "@/app/profile/hooks/useAccounts"
import { ACCOUNT_STATES, ACCOUNT_STATUSES } from "@/app/profile/constants/account.constants"

export function Composer({ thread }: { thread: ThreadRow }) {
  const account = useAccounts().data?.find((a) => a.id === thread.account_id)
  const send = useSend(thread.account_id, thread.id)
  const reconnect = useReconnect()
  const [text, setText] = useState("")

  if (!account) return null

  if (account.state !== "active" || account.status !== "online") {
    const reason = account.state === "active" ? ACCOUNT_STATUSES[account.status].label : ACCOUNT_STATES[account.state]
    return (
      <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
        <p className="min-w-48 flex-1">
          {account.name}: {reason.toLowerCase()}. Vẫn xem được tin cũ, chưa gửi được tin.
        </p>
        {account.state === "active" && account.status !== "connecting" && (
          <Button size="sm" variant="outline" disabled={reconnect.isPending} onClick={() => reconnect.mutate(account.id)}>
            Kết nối lại
          </Button>
        )}
      </footer>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText("")
    send.mutate(t, { onError: () => setText(t) })
  }

  return (
    <form onSubmit={submit} className="border-t p-3">
      {send.error && <p className="pb-2 text-xs text-destructive">{send.error.message}</p>}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Nhắn qua ${thread.account_name}...`} />
        <Button type="submit" disabled={send.isPending || !text.trim()}>
          <Send /> Gửi
        </Button>
      </div>
    </form>
  )
}
