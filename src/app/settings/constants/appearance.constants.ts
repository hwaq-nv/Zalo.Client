import { Monitor, Moon, Sun } from "lucide-react"

export const THEMES = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Theo hệ thống", icon: Monitor },
] as const

export const FONT_SIZES = [
  { value: 14, label: "Nhỏ" },
  { value: 16, label: "Vừa" },
  { value: 18, label: "Lớn" },
] as const
