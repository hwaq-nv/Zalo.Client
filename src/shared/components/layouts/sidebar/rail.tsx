import { Contact, type LucideIcon, MessageCircle, Settings, UserCog } from "lucide-react"
import { useMatch, useNavigate } from "react-router"
import { AccountRail } from "@/app/profile/components/account-rail"
import { Button } from "@/shared/components/ui/button"
import { Separator } from "@/shared/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip"
import type { SidebarModel } from "@/shared/models/sidebar.model"
import { useUiStore } from "@/shared/stores/ui.store"

const items: SidebarModel[] = [
  { id: "messages", label: "Tin nhắn", icon: MessageCircle },
  { id: "contacts", label: "Danh bạ", icon: Contact },
]

const manage: SidebarModel = { id: "accounts", label: "Quản lý tài khoản", icon: UserCog }

function RailButton({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-lg"
          variant={active ? "secondary" : "ghost"}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Rail() {
  const tab = useUiStore((s) => s.tab)
  const setTab = useUiStore((s) => s.setTab)
  const navigate = useNavigate()
  const home = useMatch("/") !== null
  const settings = useMatch("/settings/*") !== null

  const tabButton = ({ id, label, icon }: SidebarModel) => (
    <RailButton
      key={id}
      label={label}
      icon={icon}
      active={home && tab === id}
      onClick={() => {
        setTab(id)
        navigate("/")
      }}
    />
  )

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3 text-sidebar-foreground">
      {items.map(tabButton)}
      <Separator className="my-2 w-8!" />
      <AccountRail />
      <Separator className="my-2 w-8!" />
      {tabButton(manage)}
      <RailButton label="Cài đặt" icon={Settings} active={settings} onClick={() => navigate("/settings")} />
    </nav>
  )
}
