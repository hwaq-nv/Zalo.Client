import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Button } from "@/shared/components/ui/button"
import type { ToolbarModel } from "@/shared/models/toolbar.model"

export const Toolbar = ({ title, subtitle, avatar, online, onBack, children }: ToolbarModel & { onBack?: () => void; children?: ReactNode }) => {
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
        {online && (
          <AvatarBadge className="bg-emerald-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60 [animation-duration:2s]" />
          </AvatarBadge>
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {subtitle && <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </header>
  )
}
