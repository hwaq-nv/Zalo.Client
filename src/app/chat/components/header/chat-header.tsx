import { Info, MoreHorizontal } from "lucide-react"
import { Toolbar } from "@/shared/components/layouts/toolbar/toolbar"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Badge } from "@/shared/components/ui/badge"
import { Button } from "@/shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu"
import type { ThreadRow } from "@/shared/types"
import { useUiStore } from "@/shared/stores/ui.store"
import { usePresence } from "@/shared/hooks/useThreads"
import { formatRelative } from "@/app/chat/utils/chat.utils"
import { CallButtons } from "@/app/call/components/start-call/call-buttons"
import { useAccounts } from "@/app/profile/hooks/useAccounts"

export const ChatHeader = ({ thread }: { thread: ThreadRow }) => {
  const openThread = useUiStore((s) => s.openThread)
  const { data: presence } = usePresence(thread)
  const account = useAccounts().data?.find((a) => a.id === thread.account_id)
  const status = presence?.online ? "Đang hoạt động" : presence?.lastOnline ? `Truy cập ${formatRelative(presence.lastOnline)}` : null

  return (
    <Toolbar
      title={thread.name ?? thread.id}
      subtitle={
        <>
          {status && <span className="truncate">{status}</span>}
          <Badge variant="secondary" title={`Nhắn qua nick ${thread.account_name}`} className="max-w-48 pl-0.5 font-normal">
            <Avatar className="size-4">
              {account?.avatar && <AvatarImage src={account.avatar} />}
              <AvatarFallback className="text-[8px]">{thread.account_name[0]}</AvatarFallback>
            </Avatar>
            <span className="truncate">{thread.account_name}</span>
          </Badge>
        </>
      }
      avatar={thread.avatar}
      online={!!presence?.online}
      onBack={() => openThread()}
    >
      <CallButtons thread={thread} />
      <Dialog>
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Thông tin">
            <Info />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{thread.name ?? thread.id}</DialogTitle>
            <DialogDescription>Nhắn qua nick {thread.account_name}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Thêm">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Ghim hội thoại</DropdownMenuItem>
          <DropdownMenuItem>Tắt thông báo</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Xoá hội thoại</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Toolbar>
  )
}
