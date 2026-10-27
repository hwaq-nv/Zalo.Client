import { Fragment, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Badge } from "@/shared/components/ui/badge"
import { Skeleton } from "@/shared/components/ui/skeleton"
import type { ThreadRow } from "@/shared/types"
import { ThreadType } from "@/shared/enums/thread.enums"
import { cn } from "@/shared/utils/shadcn"
import { useUiStore } from "@/shared/stores/ui.store"
import { useMessages } from "@/app/chat/hooks/useMessages"
import { MessageBody } from "@/app/chat/components/message/message-body"
import { MessageQuote } from "@/app/chat/components/message/message-quote"
import { MessageActions } from "@/app/chat/components/message/message-actions"
import { MessageReceipt } from "@/app/chat/components/message/message-receipt"
import { TypingIndicator } from "@/app/chat/components/message/typing-indicator"
import type { ChatMessage } from "@/app/chat/models/message.model"
import { MEDIA_MESSAGE_TYPES, REACTION_EMOJI, TIMESTAMP_GAP_MS } from "@/app/chat/constants/chat.constants"
import { formatDateTime, toDateKey, formatDate, formatTime, scrollToMessage } from "@/app/chat/utils/chat.utils"

export const MessageList = ({ thread, onReply }: { thread: ThreadRow; onReply: (m: ChatMessage) => void }) => {
  const { data: messages = [], isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessages(thread.account_id, thread.id)
  const scroller = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const jumpTo = useUiStore((s) => s.jumpTo)
  const setJumpTo = useUiStore((s) => s.setJumpTo)

  // Tin cần tới chưa có trong danh sách thì kéo từng trang tin cũ cho tới khi gặp (server local nên nhanh)
  useEffect(() => {
    if (!jumpTo || isPending || isFetchingNextPage) return
    if (scrollToMessage(jumpTo)) return setJumpTo(undefined)
    if (hasNextPage) return void fetchNextPage()
    setJumpTo(undefined)
    toast("Không tìm thấy tin này trong lịch sử đã lưu")
  }, [jumpTo, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, messages.length, setJumpTo])

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !top.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && fetchNextPage(), {
      root: scroller.current,
      rootMargin: "400px 0px 0px 0px",
    })
    io.observe(top.current)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, messages.length])

  if (isPending)
    return (
      <div className="flex flex-1 flex-col justify-end gap-2 p-4">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-9 w-1/2 self-end" />
        <Skeleton className="h-9 w-2/5" />
      </div>
    )
  if (error) return <p className="flex-1 p-4 text-sm text-destructive">{error.message}</p>

  return (
    <div ref={scroller} className="flex min-h-0 flex-1 flex-col-reverse gap-1 overflow-y-auto px-4 py-3">
      <TypingIndicator thread={thread} />
      {messages.map((m, i) => {
        const newer = messages[i - 1]
        const older = messages[i + 1]
        const newDay = !older || toDateKey(older.ts) !== toDateKey(m.ts)
        const mine = m.is_self === 1
        // Tin đầu của một chuỗi liền nhau cùng người gửi: hiện ảnh (và tên nếu là nhóm)
        const firstOfRun = newDay || older.from_id !== m.from_id
        const showName = thread.type === ThreadType.Group && !mine && firstOfRun
        const showTime = !newer || newer.from_id !== m.from_id || newer.ts - m.ts > TIMESTAMP_GAP_MS
        const plain = MEDIA_MESSAGE_TYPES.has(m.msg_type) && !m.recalled
        const name = m.from_name ?? thread.name ?? "?"
        return (
          <Fragment key={m.msg_id}>
            <div id={`msg-${m.msg_id}`} className={cn("flex max-w-[85%] gap-2 md:max-w-[70%]", mine ? "self-end" : "self-start", firstOfRun && "mt-2")}>
              {!mine &&
                (firstOfRun ? (
                  <Avatar title={name}>
                    {m.from_avatar && <AvatarImage src={m.from_avatar} />}
                    <AvatarFallback>{name[0]}</AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="w-8 shrink-0" />
                ))}
              <div className={cn("flex min-w-0 flex-col gap-0.5", mine ? "items-end" : "items-start")}>
                {showName && <span className="px-1 text-xs text-muted-foreground">{m.from_name}</span>}
                <div
                  title={formatDateTime(m.ts)}
                  className={cn("group/msg relative max-w-full text-sm wrap-break-word", !plain && "rounded-2xl px-3 py-2", !plain && (mine ? "bg-primary text-primary-foreground" : "bg-muted"))}
                >
                  {m.quote && <MessageQuote quote={m.quote} />}
                  <MessageBody message={m} />
                  {!m.recalled && <MessageActions message={m} onReply={onReply} />}
                </div>
                {!!m.reactions?.length && (
                  <div className="flex gap-1">
                    {m.reactions.map((r) => (
                      <Badge key={r.icon} variant="outline" className={cn(r.mine && "border-primary")}>
                        {REACTION_EMOJI[r.icon] ?? r.icon} {r.count > 1 && r.count}
                      </Badge>
                    ))}
                  </div>
                )}
                {showTime && (
                  <span className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
                    {formatTime(m.ts)}
                    {i === 0 && mine && !m.recalled && <MessageReceipt thread={thread} message={m} />}
                  </span>
                )}
              </div>
            </div>
            {newDay && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                {formatDate(m.ts)}
              </p>
            )}
          </Fragment>
        )
      })}
      <div ref={top} className="py-2 text-center text-xs text-muted-foreground">
        {isFetchingNextPage ? "Đang tải tin cũ..." : !hasNextPage && "Đầu cuộc trò chuyện"}
      </div>
    </div>
  )
}
