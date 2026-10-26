import { useEffect, useRef } from "react"
import { Layers, Search, TriangleAlert } from "lucide-react"
import { AccountAvatar } from "@/app/profile/components/avatar/account-avatar"
import { useAccounts, useSelectedAccount } from "@/app/profile/hooks/useAccounts"
import { ACCOUNT_STATUSES } from "@/app/profile/constants/account.constants"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import { useUiStore } from "@/shared/stores/ui.store"

export const Header = () => {
  const accounts = useAccounts().data?.filter((a) => a.state === "active") ?? []
  const scope = useSelectedAccount()
  const query = useUiStore((s) => s.query)
  const setQuery = useUiStore((s) => s.setQuery)
  const setTab = useUiStore((s) => s.setTab)
  const input = useRef<HTMLInputElement>(null)
  const online = accounts.filter((a) => a.status === "online").length
  const broken = accounts.filter((a) => a.status === "offline" || a.status === "kicked").length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyK") return
      e.preventDefault()
      input.current?.select()
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])

  return (
    <header className="flex h-12 shrink-0 items-center border-b">
      <div className="flex shrink-0 items-center gap-2.5 px-3 max-md:hidden md:w-72 lg:w-80">
        {scope ? (
          <AccountAvatar account={scope} size="default" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Layers className="size-4" />
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium">{scope?.name ?? "Tất cả tài khoản"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {scope ? ACCOUNT_STATUSES[scope.status].label : `${online}/${accounts.length} đang hoạt động`}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 md:px-4">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder={scope ? `Tìm trong ${scope.name}` : "Tìm hội thoại, tin nhắn"}
            aria-label="Tìm kiếm"
            className="pl-8 sm:pr-14"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border max-sm:hidden bg-muted px-1.5 font-sans text-[10px] text-muted-foreground">
            Ctrl K
          </kbd>
        </div>
        {broken > 0 && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${broken} tài khoản đã mất kết nối`}
            className="ml-auto shrink-0 text-destructive"
            onClick={() => setTab("accounts")}
          >
            <TriangleAlert /> {broken} <span className="max-lg:hidden">tài khoản đã mất kết nối</span>
          </Button>
        )}
      </div>
    </header>
  )
}
