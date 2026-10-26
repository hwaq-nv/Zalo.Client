import type { ChatMessage } from "@/app/chat/models/message.model"
import { CallLog } from "@/app/chat/components/message/call-log"
import { MessageLink } from "@/app/chat/components/message/message-link"
import { MessageText } from "@/app/chat/components/message/message-text"
import { MESSAGE_LABELS } from "@/app/chat/constants/chat.constants"
import { MessageType, RecommendedAction } from "@/app/chat/enums/chat.enums"
import { getStickerUrl } from "@/app/chat/utils/chat.utils"
import { FileBubble } from "@/app/file-viewer/components/bubble/file-bubble"
import { openViewer } from "@/app/file-viewer/services/file-viewer.service"
import { getExtension, fileFromUrl } from "@/app/file-viewer/utils/file-viewer.utils"

export const MessageBody = ({ message }: { message: ChatMessage }) => {
  if (message.recalled) return <i className="opacity-70">Tin nhắn đã được thu hồi</i>
  if (message.text !== null) return <MessageText text={message.text} />
  const content = typeof message.content === "object" ? message.content : {}
  switch (message.msg_type) {
    case MessageType.Sticker:
      return <img src={getStickerUrl(content.id)} alt="Sticker" className="size-32" />
    case MessageType.Photo:
    case MessageType.Gif:
      return (
        <button type="button" disabled={!content.href} onClick={() => openViewer(fileFromUrl(content.href!))} className="block">
          <img src={content.thumb || content.href} alt={content.title || "Hình ảnh"} className="max-h-72 rounded-xl" />
        </button>
      )
    case MessageType.Voice:
      return <audio controls src={content.href} className="max-w-64" />
    case MessageType.File: {
      const params = JSON.parse(content.params || "{}")
      const name = content.title || "Tệp"
      return <FileBubble file={{ name, ext: (params.fileExt || getExtension(name)).toLowerCase(), size: Number(params.fileSize) || undefined, url: content.href }} />
    }
    case MessageType.Recommended:
      if (content.action === RecommendedAction.CallTime || content.action === RecommendedAction.MissedCall) return <CallLog message={message} content={content} />
      return <MessageLink href={content.href}>{content.title || content.href}</MessageLink>
    default:
      return <span className="opacity-70">{MESSAGE_LABELS[message.msg_type] ?? "[Tin nhắn]"}</span>
  }
}
