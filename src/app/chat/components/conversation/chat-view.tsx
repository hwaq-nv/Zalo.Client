import { Fragment, useEffect } from "react"
import { MessagesSquare } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty"
import { useActiveThread, useMarkRead } from "@/shared/hooks/useThreads"
import { ChatHeader } from "@/app/chat/components/header/chat-header"
import { ChatInput } from "@/app/chat/components/input/chat-input"
import { MessageList } from "@/app/chat/components/message/message-list"

export const ChatView = () => {
  const thread = useActiveThread()
  const { mutate: markRead } = useMarkRead()

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

  return (
    <>
      <ChatHeader thread={thread} />
      <Fragment key={`${thread.account_id}:${thread.id}`}>
        <MessageList thread={thread} />
        <ChatInput thread={thread} />
      </Fragment>
    </>
  )
}
