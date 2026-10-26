import { Database, Palette, Phone } from "lucide-react"
import type { SettingsSection } from "@/app/settings/models/settings.model"
import { AppearanceSettings } from "@/app/settings/pages/appearance-settings"
import { CallSettings } from "@/app/settings/pages/call-settings"
import { DataSettings } from "../pages/data-settings"

export const SECTIONS: SettingsSection[] = [
  { to: "appearance", label: "Giao diện", icon: Palette, Component: AppearanceSettings },
  { to: "calls", label: "Cuộc gọi", icon: Phone, Component: CallSettings },
  { to: "data", label:"Dữ liệu", icon: Database, Component: DataSettings}
]
