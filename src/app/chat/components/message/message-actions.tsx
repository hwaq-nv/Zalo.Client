import { Ellipsis, Reply, SmilePlus, Undo2, X } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu"
import { cn } from "@/shared/utils/shadcn"
import type { ChatMessage } from "@/app/chat/models/message.model"
import { useReact, useRecall } from "@/app/chat/hooks/useMessages"
import { REACTION_EMOJI } from "@/app/chat/constants/chat.constants"

const REACTION_ITEM = "size-9 justify-center rounded-full p-0 text-xl transition-transform duration-200 hover:scale-125 active:scale-95"

// Nằm cạnh bong bóng (cha cần `relative group/msg`), hiện khi hover hoặc khi menu con đang mở
export const MessageActions = ({ message, onReply }: { message: ChatMessage; onReply: (m: ChatMessage) => void }) => {
  const react = useReact(message.account_id, message.thread_id)
  const recall = useRecall(message.account_id, message.thread_id)
  const mine = message.is_self === 1
  const reacted = message.reactions?.some((r) => r.mine)

  return (
    <div
      className={cn(
        "absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100",
        mine ? "right-full flex-row-reverse pr-1.5" : "left-full pl-1.5",
      )}
    >
      <Button size="icon-xs" variant="ghost" title="Trả lời" onClick={() => onReply(message)}>
        <Reply />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="ghost" title="Thả cảm xúc">
            <SmilePlus />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="flex w-auto min-w-0 gap-0.5 rounded-full p-1">
          {Object.entries(REACTION_EMOJI).map(([icon, emoji], i) => (
            <DropdownMenuItem
              key={icon}
              onSelect={() => react.mutate({ msgId: message.msg_id, icon })}
              className={cn(REACTION_ITEM, "animate-in fade-in zoom-in-50 fill-mode-backwards")}
              style={{ animationDelay: `${i * 25}ms` }}
            >
              {emoji}
            </DropdownMenuItem>
          ))}
          {reacted && (
            <DropdownMenuItem title="Gỡ cảm xúc" onSelect={() => react.mutate({ msgId: message.msg_id, icon: "" })} className={cn(REACTION_ITEM, "text-muted-foreground")}>
              <X />
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {mine && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" title="Thêm">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem variant="destructive" disabled={recall.isPending} onSelect={() => recall.mutate(message.msg_id)}>
              <Undo2 /> Thu hồi
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
