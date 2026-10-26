import { Fragment, useEffect, useState } from "react"
import { MessagesSquare } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty"
import { useActiveThread, useMarkRead } from "@/shared/hooks/useThreads"
import { ChatHeader } from "@/app/chat/components/header/chat-header"
import { ChatInput } from "@/app/chat/components/input/chat-input"
import { MessageList } from "@/app/chat/components/message/message-list"
import type { ChatMessage } from "@/app/chat/models/message.model"

export const ChatView = () => {
  const thread = useActiveThread()
  const { mutate: markRead } = useMarkRead()
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

  // Tin mới đến lúc đang mở hội thoại cũng làm unread tăng, nên đọc lại theo unread
  useEffect(() => {
    if (thread?.unread) markRead({ accountId: thread.account_id, threadId: thread.id })
  }, [thread?.account_id, thread?.id, thread?.unread, markRead])

  if (!thread)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquare />
          </EmptyMedia>
          <EmptyTitle>Chọn một hội thoại để bắt đầu</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )

  // Đổi hội thoại thì tin đang trả lời (của hội thoại cũ) tự bỏ
  const reply = replyTo?.account_id === thread.account_id && replyTo.thread_id === thread.id ? replyTo : null

  return (
    <>
      <ChatHeader thread={thread} />
      <Fragment key={`${thread.account_id}:${thread.id}`}>
        <MessageList thread={thread} onReply={setReplyTo} />
        <ChatInput thread={thread} reply={reply} onReply={setReplyTo} />
      </Fragment>
    </>
  )
}
