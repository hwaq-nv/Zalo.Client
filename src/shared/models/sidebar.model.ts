import type { LucideIcon } from "lucide-react"

export type SidebarTab = "messages" | "contacts" | "accounts"

export interface SidebarModel {
  id: SidebarTab
  label: string
  icon: LucideIcon
}
