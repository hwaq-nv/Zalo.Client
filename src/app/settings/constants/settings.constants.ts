import { Database, Palette, Phone } from "lucide-react"
import type { SettingsSection } from "@/app/settings/models/settings.model"
import { AppearanceSettings } from "@/app/settings/pages/appearance-settings"
import { CallSettings } from "@/app/settings/pages/call-settings"
import { DataSettings } from "@/app/settings/pages/data-settings"

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { to: "appearance", label: "Giao diện", icon: Palette, Component: AppearanceSettings },
  { to: "calls", label: "Cuộc gọi", icon: Phone, Component: CallSettings },
  { to: "data", label:"Dữ liệu", icon: Database, Component: DataSettings}
]
