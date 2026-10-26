import type { LucideIcon } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip"

type Props = { label: string; icon: LucideIcon; active: boolean; onClick: () => void }

export const RailButton = ({ label, icon: Icon, active, onClick }: Props) => {
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
