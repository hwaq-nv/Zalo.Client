import { useState } from "react"
import { Search, X } from "lucide-react"
import { VList } from "virtua"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import { Skeleton } from "@/shared/components/ui/skeleton"
import { useSelectedAccount } from "@/app/profile/hooks/useAccounts"
import { useThreadContacts } from "@/shared/hooks/useThreads"
import type { ThreadRow } from "@/shared/types"
import { useUiStore } from "@/shared/stores/ui.store"
import { cn } from "@/shared/utils/shadcn"
import { ThreadType } from "@/shared/enums/thread.enums"
import { CONTACT_KINDS } from "@/app/contact/constants/contact.constants"
import { fold } from "@/app/contact/utils/contact.utils"

function Highlight({ text, q }: { text: string; q: string }) {
  const folded = fold(text)
  const at = q ? folded.indexOf(q) : -1
  if (at < 0 || folded.length !== text.length) return text
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-foreground/10 text-foreground">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

export function ContactList() {
  const scope = useSelectedAccount()
  const { data, isPending, error } = useThreadContacts(scope?.id)
  const active = useUiStore((s) => s.active)
  const openThread = useUiStore((s) => s.openThread)
  const [kind, setKind] = useState<ThreadType>(ThreadType.User)
  const [query, setQuery] = useState("")
  const q = fold(query.trim())
  const matches = data?.filter((t) => fold(t.name ?? t.id).includes(q)) ?? []
  const counts = CONTACT_KINDS.map((k) => matches.filter((t) => t.type === k.type).length)
  const rows = matches.filter((t) => t.type === kind)
  const other = kind === ThreadType.User ? ThreadType.Group : ThreadType.User
  const open = (t: ThreadRow) => openThread({ accountId: t.account_id, threadId: t.id })

  if (!scope) return <p className="p-3 text-sm text-muted-foreground">Chọn một tài khoản bên trái để xem danh bạ</p>

  return (
    <>
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("")
              if (e.key === "Enter" && rows[0]) open(rows[0])
            }}
            placeholder="Tìm bạn bè, nhóm"
            aria-label="Tìm trong danh bạ"
            className="pr-8 pl-8"
          />
          {query && (
            <button
              aria-label="Xoá tìm kiếm"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div role="tablist" className="relative grid grid-cols-2 rounded-lg bg-muted p-0.5">
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              kind === ThreadType.Group && "translate-x-full",
            )}
          />
          {CONTACT_KINDS.map(({ type, label }) => (
            <button
              key={type}
              role="tab"
              aria-selected={kind === type}
              onClick={() => setKind(type)}
              className={cn(
                "relative flex h-7 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]",
                kind === type && "text-foreground",
              )}
            >
              {label}
              {data && <span className="text-xs tabular-nums opacity-60">{counts[type]}</span>}
            </button>
          ))}
        </div>
      </div>
      {isPending ? (
        <div className="space-y-1 p-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 29) % 40)}%` }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="p-3 text-sm text-destructive">{error.message}</p>
      ) : !rows.length ? (
        <div className="space-y-3 p-3 text-sm text-muted-foreground">
          <p>
            {q
              ? `Không có ${CONTACT_KINDS[kind].label.toLowerCase()} nào khớp “${query.trim()}”`
              : `Nick này chưa có ${CONTACT_KINDS[kind].label.toLowerCase()} nào`}
          </p>
          {q && counts[other] > 0 && (
            <Button variant="outline" size="sm" onClick={() => setKind(other)}>
              Xem {counts[other]} {CONTACT_KINDS[other].label.toLowerCase()} khớp
            </Button>
          )}
        </div>
      ) : (
        <VList key={kind} className="flex-1">
          {rows.map((t) => (
            <button
              key={t.id}
              onClick={() => open(t)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                active?.accountId === t.account_id && active.threadId === t.id && "bg-muted",
              )}
            >
              <Avatar>
                {t.avatar && <AvatarImage src={t.avatar} />}
                <AvatarFallback>{(t.name ?? "?")[0]}</AvatarFallback>
              </Avatar>
              <p className="flex-1 truncate text-sm">
                <Highlight text={t.name ?? t.id} q={q} />
              </p>
            </button>
          ))}
        </VList>
      )}
    </>
  )
}
