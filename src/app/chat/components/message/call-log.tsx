import { Phone, PhoneMissed, Video } from "lucide-react"
import type { ChatMessage, MessageContent } from "@/app/chat/models/message.model"
import { RecommendedAction } from "@/app/chat/enums/chat.enums"
import { formatDuration } from "@/app/chat/utils/chat.utils"
import { CallType } from "@/app/call/enums/call.enums"

export const CallLog = ({ message, content }: { message: ChatMessage; content: MessageContent }) => {
  const params = JSON.parse(content.params || "{}")
  const outgoing = (message.is_self === 1) === (params.isCaller === 1)
  const missed = content.action === RecommendedAction.MissedCall
  const Icon = missed ? PhoneMissed : params.calltype === CallType.Video ? Video : Phone
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 shrink-0" />
      <span className="flex flex-col">
        <span>{missed && !outgoing ? "Cuộc gọi nhỡ" : `Cuộc gọi ${params.calltype === CallType.Video ? "video" : "thoại"} ${outgoing ? "đi" : "đến"}`}</span>
        <span className="text-xs opacity-70">{missed ? (outgoing ? "Không trả lời" : "") : formatDuration(params.duration ?? 0)}</span>
      </span>
    </span>
  )
}
