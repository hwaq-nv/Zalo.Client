import { Fragment, useEffect, useRef } from "react"
import { Badge } from "@/shared/components/ui/badge"
import { Skeleton } from "@/shared/components/ui/skeleton"
import type { ThreadRow } from "@/shared/types"
import { ThreadType } from "@/shared/enums/thread.enums"
import { cn } from "@/shared/utils/shadcn"
import { useMessages } from "@/app/chat/hooks/useMessages"
import { MessageBody } from "@/app/chat/components/message/message-body"
import { MEDIA_MESSAGE_TYPES, REACTION_EMOJI, TIMESTAMP_GAP_MS } from "@/app/chat/constants/chat.constants"
import { formatDateTime, toDateKey, formatDate, formatTime } from "@/app/chat/utils/chat.utils"

export const MessageList = ({ thread }: { thread: ThreadRow }) => {
  const { data: messages = [], isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessages(thread.account_id, thread.id)
  const scroller = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)

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
      {messages.map((m, i) => {
        const newer = messages[i - 1]
        const older = messages[i + 1]
        const newDay = !older || toDateKey(older.ts) !== toDateKey(m.ts)
        const mine = m.is_self === 1
        const showName = thread.type === ThreadType.Group && !mine && (newDay || older.from_id !== m.from_id)
        const showTime = !newer || newer.from_id !== m.from_id || newer.ts - m.ts > TIMESTAMP_GAP_MS
        const plain = MEDIA_MESSAGE_TYPES.has(m.msg_type) && !m.recalled
        return (
          <Fragment key={m.msg_id}>
            <div className={cn("flex max-w-[85%] flex-col gap-0.5 md:max-w-[70%]", mine ? "items-end self-end" : "items-start self-start", showName && "mt-2")}>
              {showName && <span className="px-1 text-xs text-muted-foreground">{m.from_name}</span>}
              <div
                title={formatDateTime(m.ts)}
                className={cn("text-sm", !plain && "rounded-2xl px-3 py-2", !plain && (mine ? "bg-primary text-primary-foreground" : "bg-muted"))}
              >
                {m.quote && <p className="mb-1 line-clamp-2 border-l-2 border-current/40 pl-2 text-xs opacity-70">{m.quote.msg}</p>}
                <MessageBody message={m} />
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
              {showTime && <span className="px-1 text-[10px] text-muted-foreground">{formatTime(m.ts)}</span>}
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
