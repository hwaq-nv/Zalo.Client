import { MicOff } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { cn } from "@/shared/utils/shadcn"
import { useVideo } from "@/app/call/hooks/useVideo"

type Props = {
  accountId: string
  src: string
  name: string
  avatar: string
  off?: boolean
  muted?: boolean
  speaking?: boolean
  label?: boolean
  tile?: boolean
  className?: string
}

export const VideoTile = ({ accountId, src, name, avatar, off, muted, speaking, label, tile, className }: Props) => {
  const { ref, live } = useVideo(accountId, src, tile)
  const show = live && !off
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-zinc-900", speaking && "ring-2 ring-green-500", className)}>
      <canvas ref={ref} className={cn("size-full object-contain", !show && "invisible")} />
      {!show && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar className="size-14">
            {avatar && <AvatarImage src={avatar} />}
            <AvatarFallback>{name[0]}</AvatarFallback>
          </Avatar>
        </div>
      )}
      {label && (
        <span className="absolute bottom-1 left-1 flex max-w-[90%] items-center gap-1 truncate rounded bg-black/60 px-1.5 text-xs text-white">
          {muted && <MicOff className="size-3 shrink-0" />}
          {name}
        </span>
      )}
    </div>
  )
}
