import type { ReactNode } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"

export const MessageLink = ({ href, children }: { href?: string; children: ReactNode }) => {
  if (!href) return children
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        openUrl(href)
      }}
      className="underline-offset-2 hover:underline"
    >
      {children}
    </a>
  )
}
