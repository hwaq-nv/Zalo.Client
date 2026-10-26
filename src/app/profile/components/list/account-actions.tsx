import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog"
import { Button } from "@/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu"
import type { Account } from "@/shared/types"
import { useReconnect, useRemoveAccount, useSetAccountState } from "@/app/profile/hooks/useAccounts"

export const AccountActions = ({ account }: { account: Account }) => {
  const reconnect = useReconnect()
  const setState = useSetAccountState()
  const remove = useRemoveAccount()
  const [removing, setRemoving] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Tuỳ chọn">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {account.state === "active" ? (
            <>
              <DropdownMenuItem disabled={account.status === "online" || account.status === "connecting"} onSelect={() => reconnect.mutate(account.id)}>
                Kết nối lại
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setState.mutate({ id: account.id, state: "locked" })}>Đánh dấu bị khoá</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setState.mutate({ id: account.id, state: "retired" })}>Ngừng dùng</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setState.mutate({ id: account.id, state: "active" })}>Dùng lại</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
            Xoá vĩnh viễn
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hội thoại và tin nhắn của nick này bị xoá khỏi máy, danh bạ vẫn giữ. Muốn giữ dữ liệu thì chọn Ngừng dùng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                remove.mutate(account.id, { onSuccess: () => setRemoving(false) })
              }}
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
