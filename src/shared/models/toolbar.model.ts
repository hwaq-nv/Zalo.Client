import type { ReactNode } from "react"

export interface ToolbarModel {
  title: string
  subtitle?: ReactNode
  avatar?: string | null
  online?: boolean
}
