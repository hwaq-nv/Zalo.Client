import type { ThreadRow } from "@/shared/types"
import { useTyping } from "@/app/chat/hooks/useMessages"

// pl-10 = cột avatar (w-8) + gap-2 của dòng tin, cho thẳng hàng với bong bóng
export const TypingIndicator = ({ thread }: { thread: ThreadRow }) => {
  const typing = useTyping(thread.account_id, thread.id)
  if (!typing) return null
  return (
    <div className="flex items-center gap-2 self-start pt-1 pl-10 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1">
      <span className="flex h-7 items-center gap-1 rounded-2xl bg-muted px-3">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      {typing.name ?? thread.name} đang soạn tin
    </div>
  )
}
