import { useState, type ReactNode } from "react"
import type { ThreadRow } from "@/shared/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Button } from "@/shared/components/ui/button"
import { Checkbox } from "@/shared/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog"
import { Input } from "@/shared/components/ui/input"
import { Skeleton } from "@/shared/components/ui/skeleton"
import { useGroupCallMembers, useStartCall } from "@/app/call/hooks/useCall"

export const GroupCallDialog = ({ thread, video, children }: { thread: ThreadRow; video: boolean; children: ReactNode }) => {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const { data, error } = useGroupCallMembers(thread.account_id, open ? thread.id : undefined)
  const start = useStartCall()
  const max = (data?.maxUsers ?? 5) - 1
  const q = query.trim().toLocaleLowerCase("vi")
  const shown = data?.members.filter((m) => m.name.toLocaleLowerCase("vi").includes(q))

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p))
  const call = () => {
    start.mutate({ thread, video, members: data?.members.filter((m) => picked.includes(m.id)) })
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        setPicked([])
        setQuery("")
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{video ? "Gọi video nhóm" : "Gọi thoại nhóm"}</DialogTitle>
          <DialogDescription>Chọn tối đa {max} người trong {thread.name ?? "nhóm"}</DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm thành viên" />
        <div className="-mx-1 max-h-[min(20rem,40vh)] overflow-y-auto">
          {error ? (
            <p className="px-1 text-destructive">{error.message}</p>
          ) : !shown ? (
            <Skeleton className="h-40" />
          ) : (
            shown.map((m) => {
              const on = picked.includes(m.id)
              return (
                <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
                  <Checkbox checked={on} disabled={!on && picked.length >= max} onCheckedChange={() => toggle(m.id)} />
                  <Avatar size="sm">
                    {m.avatar && <AvatarImage src={m.avatar} />}
                    <AvatarFallback>{m.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.name}</span>
                </label>
              )
            })
          )}
        </div>
        <Button disabled={!picked.length} onClick={call}>
          Gọi {picked.length ? `(${picked.length})` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
