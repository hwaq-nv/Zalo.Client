import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Button } from "@/shared/components/ui/button"
import type { ToolbarModel } from "@/shared/models/toolbar.model"

export function Toolbar({ title, subtitle, avatar, onBack, children }: ToolbarModel & { onBack?: () => void; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-2 sm:px-4">
      {onBack && (
        <Button size="icon" variant="ghost" aria-label="Quay lại" className="-mr-1 md:hidden" onClick={onBack}>
          <ArrowLeft />
        </Button>
      )}
      <Avatar size="lg">
        {avatar && <AvatarImage src={avatar} />}
        <AvatarFallback>{title[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}
