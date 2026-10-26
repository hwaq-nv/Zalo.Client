import { VList } from "virtua"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Badge } from "@/shared/components/ui/badge"
import { Skeleton } from "@/shared/components/ui/skeleton"
import { useSearchMessages } from "@/app/chat/hooks/useMessages"
import { useSelectedAccount } from "@/app/profile/hooks/useAccounts"
import { useThreads } from "@/shared/hooks/useThreads"
import { useUiStore } from "@/shared/stores/ui.store"
import { cn } from "@/shared/utils/shadcn"

export const ThreadList = () => {
  const { data, isPending, error } = useThreads()
  const scope = useSelectedAccount()
  const active = useUiStore((s) => s.active)
  const openThread = useUiStore((s) => s.openThread)
  const query = useUiStore((s) => s.query.trim())
  const q = query.toLowerCase()
  const threads =
    data?.filter((t) => (!scope || t.account_id === scope.id) && (t.name ?? t.id).toLowerCase().includes(q)) ?? []
  const hits = useSearchMessages(query, scope?.id)

  return (
    <>
      {isPending ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : error ? (
        <p className="p-3 text-sm text-destructive">{error.message}</p>
      ) : !threads.length && !hits.length ? (
        <p className="p-3 text-sm text-muted-foreground">{q ? "Không tìm thấy kết quả" : "Chưa có hội thoại"}</p>
      ) : (
        <VList className="flex-1">
          {threads.map((t) => (
            <button
              key={`${t.account_id}:${t.id}`}
              onClick={() => openThread({ accountId: t.account_id, threadId: t.id })}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted",
                active?.accountId === t.account_id && active.threadId === t.id && "bg-muted",
              )}
            >
              <Avatar size="lg">
                {t.avatar && <AvatarImage src={t.avatar} />}
                <AvatarFallback>{(t.name ?? "?")[0]}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="flex-1 truncate text-sm font-medium">{t.name ?? t.id}</p>
                  {!scope && (
                    <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">{t.account_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-xs text-muted-foreground">{t.preview}</p>
                  {t.unread > 0 && <Badge>{t.unread}</Badge>}
                </div>
              </div>
            </button>
          ))}
          {hits.length > 0 && <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">Tin nhắn</p>}
          {hits.map((m) => (
            <button
              key={m.id}
              onClick={() => openThread({ accountId: m.account_id, threadId: m.thread_id })}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted"
            >
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="flex-1 truncate font-medium text-foreground">{m.thread?.name ?? m.thread_id}</span>
                {!scope && <span className="max-w-24 shrink-0 truncate">{m.thread?.account_name}</span>}
                <span className="shrink-0">{new Date(m.ts).toLocaleDateString("vi-VN")}</span>
              </div>
              <p className="line-clamp-2 text-sm">
                {m.is_self ? "Bạn" : (m.from_name ?? "?")}: {m.text ?? "[Tin nhắn]"}
              </p>
            </button>
          ))}
        </VList>
      )}
    </>
  )
}
