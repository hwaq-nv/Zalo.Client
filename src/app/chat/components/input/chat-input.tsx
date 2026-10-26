import { type FormEvent, useEffect, useRef, useState } from "react"
import { Paperclip, Reply, Send, X } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import type { ThreadRow } from "@/shared/types"
import type { ChatMessage } from "@/app/chat/models/message.model"
import { useSendMessage } from "@/app/chat/hooks/useMessages"
import { getMessagePreview } from "@/app/chat/utils/chat.utils"
import { StickerPicker } from "@/app/chat/components/input/sticker-picker"
import { EmojiPicker } from "@/app/chat/components/input/emoji-picker"
import { FILE_ICONS } from "@/app/file-viewer/constants/file-viewer.constants"
import { formatSize, getExtension, getFileType } from "@/app/file-viewer/utils/file-viewer.utils"
import { useAccounts, useReconnect } from "@/app/profile/hooks/useAccounts"
import { ACCOUNT_STATES, ACCOUNT_STATUSES } from "@/app/profile/constants/account.constants"

// reply = tin đang trả lời; onReply(null) để bỏ
export const ChatInput = ({ thread, reply, onReply }: { thread: ThreadRow; reply: ChatMessage | null; onReply: (m: ChatMessage | null) => void }) => {
  const account = useAccounts().data?.find((a) => a.id === thread.account_id)
  const send = useSendMessage(thread.account_id, thread.id)
  const reconnect = useReconnect()
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const input = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // Vị trí con trỏ cuối cùng trong ô nhập: bấm emoji làm ô nhập mất focus nên phải tự nhớ
  const caret = useRef<number | null>(null)

  useEffect(() => {
    if (reply) input.current?.focus()
  }, [reply])

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

  const addFiles = (picked: File[]) => setFiles((f) => [...f, ...picked])

  function insertEmoji(emoji: string) {
    const at = caret.current ?? text.length
    setText(text.slice(0, at) + emoji + text.slice(at))
    caret.current = at + emoji.length
  }

  function focusInput() {
    const el = input.current!
    el.focus()
    if (caret.current !== null) el.setSelectionRange(caret.current, caret.current)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t && !files.length) return
    setText("")
    setFiles([])
    onReply(null)
    send.mutate(
      { text: t, quoteMsgId: reply?.msg_id, files },
      {
        onError: () => {
          setText(t)
          setFiles(files)
          onReply(reply)
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="border-t p-3">
      {send.error && <p className="pb-2 text-xs text-destructive">{send.error.message}</p>}
      {reply && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted/60 py-1.5 pr-1 pl-2.5 text-xs animate-in fade-in slide-in-from-bottom-1">
          <Reply className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Trả lời {reply.is_self ? thread.account_name : reply.from_name}</span>
            <span className="block truncate text-muted-foreground">{getMessagePreview(reply)}</span>
          </span>
          <Button type="button" size="icon-xs" variant="ghost" title="Bỏ trả lời (Esc)" onClick={() => onReply(null)}>
            <X />
          </Button>
        </div>
      )}
      {!!files.length && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => {
            const Icon = FILE_ICONS[getFileType(getExtension(f.name))]
            return (
              <li key={i} className="flex max-w-56 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-2 text-xs animate-in fade-in zoom-in-95">
                <Icon className="size-5 shrink-0 opacity-70" strokeWidth={1.5} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="text-muted-foreground">{formatSize(f.size)}</span>
                </span>
                <Button type="button" size="icon-xs" variant="ghost" title="Bỏ tệp" onClick={() => setFiles(files.filter((x) => x !== f))}>
                  <X />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex gap-1">
        <EmojiPicker onPick={insertEmoji} onClose={focusInput} />
        <StickerPicker thread={thread} />
        <Button type="button" variant="ghost" size="icon" title="Gửi tệp" onClick={() => fileInput.current?.click()}>
          <Paperclip />
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...e.target.files!])
            e.target.value = "" // chọn lại đúng tệp đó vẫn ra change
          }}
        />
        <Input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSelect={(e) => (caret.current = e.currentTarget.selectionStart)}
          onKeyDown={(e) => e.key === "Escape" && onReply(null)}
          // Dán ảnh chụp màn hình = đính kèm; dán chữ thì giữ như thường
          onPaste={(e) => {
            if (!e.clipboardData.files.length || e.clipboardData.getData("text")) return
            e.preventDefault()
            addFiles([...e.clipboardData.files])
          }}
          placeholder={`Nhắn qua ${thread.account_name}...`}
          className="ml-1"
        />
        <Button type="submit" disabled={send.isPending || (!text.trim() && !files.length)} className="ml-1">
          <Send /> Gửi
        </Button>
      </div>
    </form>
  )
}
