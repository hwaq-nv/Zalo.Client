import { Phone, Video } from "lucide-react"
import type { ThreadRow } from "@/shared/types"
import { ThreadType } from "@/shared/enums/thread.enums"
import { Button } from "@/shared/components/ui/button"
import { GroupCallDialog } from "@/app/call/components/start-call/group-call-dialog"
import { useStartCall } from "@/app/call/hooks/useCall"
import { useCallStore } from "@/app/call/stores/call.store"

export const CallButtons = ({ thread }: { thread: ThreadRow }) => {
  const start = useStartCall()
  const busy = useCallStore((s) => !!s.call)
  const button = (video: boolean, onClick?: () => void) => (
    <Button size="icon" variant="ghost" aria-label={video ? "Gọi video" : "Gọi thoại"} disabled={busy} onClick={onClick}>
      {video ? <Video /> : <Phone />}
    </Button>
  )
  if (thread.type === ThreadType.Group)
    return (
      <>
        <GroupCallDialog thread={thread} video={false}>
          {button(false)}
        </GroupCallDialog>
        <GroupCallDialog thread={thread} video>
          {button(true)}
        </GroupCallDialog>
      </>
    )
  return (
    <>
      {button(false, () => start.mutate({ thread, video: false }))}
      {button(true, () => start.mutate({ thread, video: true }))}
    </>
  )
}
