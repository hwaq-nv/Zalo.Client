import type { CallState } from "@/shared/types"
import { cn } from "@/shared/utils/shadcn"
import { VideoTile } from "@/app/call/components/in-call/video-tile"
import { CallMemberState } from "@/app/call/enums/call.enums"
import { useCallStore } from "@/app/call/stores/call.store"

export const CallMedia = ({ accountId, state }: { accountId: string; state: CallState }) => {
  const speaking = useCallStore((s) => s.speaking)
  const self = state.camera && <VideoTile accountId={accountId} src="self" name="Bạn" avatar="" label={state.group} className="aspect-video" />
  if (!state.group)
    return (
      <div className="relative min-h-0 flex-1">
        <VideoTile accountId={accountId} src="peer" name={state.name} avatar={state.avatar} off={state.peerCamOff} className="size-full" />
        {self && <div className="absolute right-2 bottom-2 w-1/4">{self}</div>}
      </div>
    )
  const members = state.members.filter((m) => m.state === CallMemberState.InCall || m.state === CallMemberState.Ringing || m.state === CallMemberState.Calling)
  return (
    <div className={cn("grid min-h-0 gap-2 overflow-y-auto p-0.5", members.length + 1 > 4 ? "grid-cols-3" : "grid-cols-2")}>
      {self}
      {members.map((m) => (
        <VideoTile
          key={m.src}
          accountId={accountId}
          src={m.src}
          name={m.state === CallMemberState.InCall ? m.name : `${m.name} (đang gọi…)`}
          avatar={m.avatar}
          off={m.camOff}
          muted={m.muted}
          speaking={speaking[m.src]}
          label
          tile
          className="aspect-video"
        />
      ))}
    </div>
  )
}
