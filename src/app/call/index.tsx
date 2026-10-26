import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { CallControls } from "@/app/call/components/in-call/call-controls"
import { CallMedia } from "@/app/call/components/in-call/call-media"
import { useCallTimer } from "@/app/call/hooks/useCallTimer"
import { useRingtone } from "@/app/call/hooks/useRingtone"
import { useCallStore } from "@/app/call/stores/call.store"

export const CallWindow = () => {
  const call = useCallStore((s) => s.call)
  const state = call?.state
  const duration = useCallTimer(state?.since ?? 0)
  useRingtone(state?.phase === "incoming" && !state.noAnswer ? "ring" : state?.phase === "outgoing" ? "ringback" : null)

  if (!call || !state) return null

  const media = (state.video || state.group) && state.phase !== "incoming"
  return (
    <div className="flex h-screen flex-col justify-center gap-3 bg-background p-4 text-sm text-foreground">
      {media && <CallMedia accountId={call.accountId} state={state} />}
      <div className="flex items-center gap-3">
        {!media && (
          <Avatar size="lg">
            {state.avatar && <AvatarImage src={state.avatar} />}
            <AvatarFallback>{state.name[0]}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{state.name}</p>
          <p className="truncate text-muted-foreground">
            {state.since ? `${duration}${state.group ? ` · ${state.text}` : ""}` : state.text}
            {state.peerMuted && " · bên kia tắt micro"}
          </p>
        </div>
      </div>
      {state.notice && <p className="text-xs text-amber-600 dark:text-amber-400">{state.notice}</p>}
      <CallControls accountId={call.accountId} state={state} />
    </div>
  )
}
