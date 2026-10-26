import { Info, MoreHorizontal } from "lucide-react"
import { Toolbar } from "@/shared/components/layouts/toolbar/toolbar"
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
import { CallButtons } from "@/app/call/components/call-buttons"

export function ChatHeader({ thread }: { thread: ThreadRow }) {
  const openThread = useUiStore((s) => s.openThread)

  return (
    <Toolbar title={thread.name ?? thread.id} subtitle={`qua ${thread.account_name}`} avatar={thread.avatar} onBack={() => openThread()}>
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
