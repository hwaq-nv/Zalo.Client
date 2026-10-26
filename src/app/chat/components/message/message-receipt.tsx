import { Check, CheckCheck } from "lucide-react"
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/shared/components/ui/avatar"
import { ThreadType } from "@/shared/enums/thread.enums"
import type { ThreadRow } from "@/shared/types"
import type { ChatMessage } from "@/app/chat/models/message.model"
import { useReceipts } from "@/app/chat/hooks/useMessages"

const MAX_SEERS = 5

// Đã gửi → Đã nhận → Đã xem cho tin của mình; nhóm thì hiện ảnh những người đã xem
export const MessageReceipt = ({ thread, message }: { thread: ThreadRow; message: ChatMessage }) => {
  const { data: receipts = [] } = useReceipts(thread.account_id, thread.id)
  const id = Number(message.msg_id)
  const seers = receipts.filter((r) => r.seen_msg_id >= id)

  if (!seers.length) {
    const delivered = receipts.some((r) => r.delivered_msg_id >= id)
    const Icon = delivered ? CheckCheck : Check
    return (
      <span className="flex items-center gap-0.5">
        <Icon className="size-3" /> {delivered ? "Đã nhận" : "Đã gửi"}
      </span>
    )
  }
  if (thread.type === ThreadType.User)
    return (
      <span className="flex items-center gap-0.5 font-medium text-foreground animate-in fade-in">
        <CheckCheck className="size-3" /> Đã xem
      </span>
    )
  return (
    <span title={`Đã xem: ${seers.map((r) => r.name ?? r.user_id).join(", ")}`} className="flex items-center gap-1 animate-in fade-in">
      <AvatarGroup className="-space-x-1">
        {seers.slice(0, MAX_SEERS).map((r) => (
          <Avatar key={r.user_id} className="size-4">
            {r.avatar && <AvatarImage src={r.avatar} />}
            <AvatarFallback className="text-[8px]">{(r.name ?? "?")[0]}</AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
      {seers.length > MAX_SEERS && `+${seers.length - MAX_SEERS}`}
    </span>
  )
}
