import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"

export type SettingsSection = {
  to: string
  label: string
  icon: LucideIcon
  Component: ComponentType
}

// Tên rỗng: thiết bị mặc định
export type MediaPrefs = { mic: string; speaker: string; camera: string; noiseSuppression: boolean; micGain: boolean }
export type Devices = { mics: string[]; speakers: string[]; cameras: string[] }
