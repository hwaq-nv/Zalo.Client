import { useEffect, useState } from "react"
import { clock } from "@/app/call/utils/call.utils"

export function useDuration(since: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return clock(Math.max(0, Math.floor((now - since) / 1000)))
}
