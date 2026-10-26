import { Plus } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/shared/components/ui/item"
import { Skeleton } from "@/shared/components/ui/skeleton"
import { useAccounts } from "@/app/profile/hooks/useAccounts"
import { AccountActions } from "@/app/profile/components/account-actions"
import { AccountAvatar } from "@/app/profile/components/account-avatar"
import { LoginQrDialog } from "@/app/profile/components/login-qr-dialog"
import { ACCOUNT_STATES, ACCOUNT_STATUSES } from "@/app/profile/constants/account.constants"

export function AccountList() {
  const { data, isPending, error } = useAccounts()

  return (
    <>
      <div className="flex items-center justify-between p-3">
        <p className="font-medium">Tài khoản</p>
        <LoginQrDialog>
          <Button size="sm">
            <Plus /> Thêm
          </Button>
        </LoginQrDialog>
      </div>
      {isPending ? (
        <div className="space-y-2 px-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : error ? (
        <p className="px-3 text-sm text-destructive">{error.message}</p>
      ) : !data.length ? (
        <p className="px-3 text-sm text-muted-foreground">Chưa có tài khoản nào</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {data.map((a) => (
            <Item key={a.id}>
              <ItemMedia>
                <AccountAvatar account={a} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="block w-full truncate">{a.name}</ItemTitle>
                <ItemDescription className="line-clamp-1">{a.state === "active" ? ACCOUNT_STATUSES[a.status].label : ACCOUNT_STATES[a.state]}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <AccountActions account={a} />
              </ItemActions>
            </Item>
          ))}
        </div>
      )}
    </>
  )
}
