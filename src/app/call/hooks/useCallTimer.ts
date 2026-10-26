import { useEffect, useState } from "react"
import { formatTimer } from "@/app/call/utils/call.utils"

export function useCallTimer(since: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return formatTimer(Math.max(0, Math.floor((now - since) / 1000)))
}
