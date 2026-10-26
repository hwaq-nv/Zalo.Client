import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Volume2, VolumeX } from "lucide-react"
import type { CallState } from "@/shared/types"
import { Button } from "@/shared/components/ui/button"
import { ACCEPT_BUTTON_CLASS } from "@/app/call/constants/call.constants"
import { sendCallAction } from "@/app/call/services/call.service"

export const CallControls = ({ accountId, state }: { accountId: string; state: CallState }) => {
  const act = (action: "mute" | "speaker" | "camera", on: boolean) => sendCallAction(accountId, { action, on })
  const hasCamera = state.video || state.group
  if (state.phase === "incoming")
    return state.noAnswer ? (
      <Button variant="secondary" onClick={() => sendCallAction(accountId, { action: "reject" })}>
        Bỏ qua
      </Button>
    ) : (
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="destructive" onClick={() => sendCallAction(accountId, { action: "reject" })}>
          <PhoneOff /> Từ chối
        </Button>
        {hasCamera && (
          <Button variant="secondary" onClick={() => sendCallAction(accountId, { action: "accept", on: false })}>
            <VideoOff /> Không mở camera
          </Button>
        )}
        <Button className={ACCEPT_BUTTON_CLASS} onClick={() => sendCallAction(accountId, { action: "accept", on: hasCamera })}>
          {hasCamera ? <Video /> : <Phone />} Trả lời
        </Button>
      </div>
    )
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="icon-lg" variant="secondary" aria-label={state.muted ? "Bật micro" : "Tắt micro"} onClick={() => act("mute", !state.muted)}>
        {state.muted ? <MicOff /> : <Mic />}
      </Button>
      <Button size="icon-lg" variant="secondary" aria-label={state.speakerOff ? "Bật loa" : "Tắt loa"} onClick={() => act("speaker", !state.speakerOff)}>
        {state.speakerOff ? <VolumeX /> : <Volume2 />}
      </Button>
      {hasCamera && (
        <Button size="icon-lg" variant="secondary" aria-label={state.camera ? "Tắt camera" : "Bật camera"} onClick={() => act("camera", !state.camera)}>
          {state.camera ? <Video /> : <VideoOff />}
        </Button>
      )}
      <Button size="icon-lg" variant="destructive" aria-label="Kết thúc" onClick={() => sendCallAction(accountId, { action: "hangup" })}>
        <PhoneOff />
      </Button>
    </div>
  )
}
