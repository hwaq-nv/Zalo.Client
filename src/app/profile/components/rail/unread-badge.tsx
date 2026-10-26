import { Badge } from "@/shared/components/ui/badge"

export const UnreadBadge = ({ count = 0 }: { count?: number }) => {
  if (!count) return null
  return (
    <Badge className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] ring-2 ring-sidebar">
      {count > 99 ? "99+" : count}
    </Badge>
  )
}
