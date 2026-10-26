import { ChatView } from "@/app/chat/components/conversation/chat-view"
import { Header } from "@/shared/components/layouts/header/header"
import { Sidebar } from "@/shared/components/layouts/sidebar/sidebar"
import { useUiStore } from "@/shared/stores/ui.store"
import { cn } from "@/shared/utils/shadcn"

export const ChatScreen = () => {
  const open = useUiStore((s) => !!s.active)

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar className={cn(open && "max-md:hidden")} />
        <main className={cn("flex min-w-0 flex-1 flex-col", !open && "max-md:hidden")}>
          <ChatView />
        </main>
      </div>
    </div>
  )
}
