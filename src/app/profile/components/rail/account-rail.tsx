import { useEffect } from "react"
import { Layers, Plus } from "lucide-react"
import { useNavigate } from "react-router"
import { Button } from "@/shared/components/ui/button"
import { Kbd } from "@/shared/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip"
import { useUnreadByAccount } from "@/shared/hooks/useThreads"
import { useUiStore } from "@/shared/stores/ui.store"
import { cn } from "@/shared/utils/shadcn"
import { AccountAvatar } from "@/app/profile/components/avatar/account-avatar"
import { LoginQrDialog } from "@/app/profile/components/login/login-qr-dialog"
import { UnreadBadge } from "@/app/profile/components/rail/unread-badge"
import { useAccounts, useSelectedAccount } from "@/app/profile/hooks/useAccounts"
import { ACCOUNT_STATUSES } from "@/app/profile/constants/account.constants"

export const AccountRail = () => {
  const accounts = useAccounts().data?.filter((a) => a.state === "active") ?? []
  const selected = useSelectedAccount()
  const selectAccount = useUiStore((s) => s.selectAccount)
  const navigate = useNavigate()
  const unread = useUnreadByAccount()
  const total = [...unread.values()].reduce((a, b) => a + b, 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || !e.code.startsWith("Digit")) return
      const n = Number(e.code.slice(5))
      if (n && !accounts[n - 1]) return
      e.preventDefault()
      selectAccount(n ? accounts[n - 1].id : undefined)
      navigate("/")
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [accounts, selectAccount, navigate])

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1.5 [scrollbar-width:none]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-lg"
            variant={selected ? "ghost" : "secondary"}
            aria-label="Tất cả tài khoản"
            aria-pressed={!selected}
            className="relative shrink-0"
            onClick={() => {
              selectAccount(undefined)
              navigate("/")
            }}
          >
            <Layers />
            <UnreadBadge count={total} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Tất cả tài khoản <Kbd>Ctrl+0</Kbd>
        </TooltipContent>
      </Tooltip>
      {accounts.map((a, i) => (
        <Tooltip key={a.id}>
          <TooltipTrigger asChild>
            <button
              aria-label={a.name}
              aria-pressed={selected?.id === a.id}
              onClick={() => {
                selectAccount(a.id)
                navigate("/")
              }}
              className={cn(
                "relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected?.id === a.id && "ring-2 ring-primary ring-offset-2 ring-offset-sidebar",
              )}
            >
              <AccountAvatar account={a} />
              <UnreadBadge count={unread.get(a.id)} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span className="flex flex-col">
              {a.name}
              <span className="opacity-60">{ACCOUNT_STATUSES[a.status].label}</span>
            </span>
            {i < 9 && <Kbd>Ctrl+{i + 1}</Kbd>}
          </TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <LoginQrDialog>
          <TooltipTrigger asChild>
            <Button size="icon-lg" variant="ghost" aria-label="Thêm tài khoản" className="shrink-0 rounded-full border-dashed border-border">
              <Plus />
            </Button>
          </TooltipTrigger>
        </LoginQrDialog>
        <TooltipContent side="right">Thêm tài khoản</TooltipContent>
      </Tooltip>
    </div>
  )
}
