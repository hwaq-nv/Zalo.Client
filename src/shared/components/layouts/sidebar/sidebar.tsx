import { ContactList } from "@/app/contact/components/contact-list"
import { AccountList } from "@/app/profile/components/account-list"
import { useUiStore } from "@/shared/stores/ui.store"
import { cn } from "@/shared/utils/shadcn"
import { ThreadList } from "./thread-list"

export function Sidebar({ className }: { className?: string }) {
  const tab = useUiStore((s) => s.tab)

  return (
    <aside className={cn("flex w-full shrink-0 flex-col md:w-72 md:border-r lg:w-80", className)}>
      {tab === "messages" && <ThreadList />}
      {tab === "contacts" && <ContactList />}
      {tab === "accounts" && <AccountList />}
    </aside>
  )
}
