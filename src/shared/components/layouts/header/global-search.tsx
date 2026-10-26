import { Fragment, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Input } from "@/shared/components/ui/input"
import { ThreadType } from "@/shared/enums/thread.enums"
import { useAllThreadContacts, useFindByPhone, useThreads } from "@/shared/hooks/useThreads"
import { useUiStore } from "@/shared/stores/ui.store"
import { cn } from "@/shared/utils/shadcn"
import useClickOutside from "@/core/hooks/useClickOutside"
import { useSearchMessages } from "@/app/chat/hooks/useMessages"
import { formatDate, getMessagePreview } from "@/app/chat/utils/chat.utils"
import { HighlightText } from "@/app/contact/components/list/highlight-text"
import { removeDiacritics } from "@/app/contact/utils/contact.utils"
import { useAccounts, useSelectedAccount } from "@/app/profile/hooks/useAccounts"

const MAX_PER_SECTION = 8
// 0912345678, 84912345678, +84 912 345 678
const PHONE = /^(0|84)\d{9}$/

type Result = {
  key: string
  section: string
  avatar: string | null
  title: string
  subtitle: string
  meta?: string
  select: () => void
}

export const GlobalSearch = () => {
  const scope = useSelectedAccount()
  const accounts = useAccounts().data?.filter((a) => a.state === "active") ?? []
  const threads = useThreads().data ?? []
  const openThread = useUiStore((s) => s.openThread)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const q = removeDiacritics(query.trim())
  const contacts = useAllThreadContacts(q ? (scope ? [scope.id] : accounts.map((a) => a.id)) : [])
  const hits = useSearchMessages(query.trim(), scope?.id)
  const matches = (name: string) => !!q && removeDiacritics(name).includes(q)

  // Tìm số qua nick đang lọc, hoặc nick online đầu tiên; mỗi lượt tìm tốn hạn mức trong ngày của nick đó
  const digits = query.replace(/[\s.()+-]/g, "")
  const phone = PHONE.test(digits) ? digits : null
  const finder = scope ?? accounts.find((a) => a.status === "online")
  const found = useFindByPhone(finder?.status === "online" ? finder.id : undefined, phone)
  const phoneStatus = !phone
    ? null
    : finder?.status !== "online"
      ? `Cần ${finder ? `nick ${finder.name}` : "một nick"} đang online để tìm theo số điện thoại`
      : found.isFetching
        ? `Đang tìm số ${phone} qua nick ${finder.name}...`
        : found.error
          ? found.error.message.startsWith("404")
            ? `Không có tài khoản Zalo nào dùng số ${phone}`
            : `Không tìm được số ${phone}: ${found.error.message}`
          : null

  // Hội thoại đã nhắn (mới nhất trước) rồi tới bạn bè/nhóm chưa nhắn; cùng một người thì giữ bản đã nhắn
  const seen = new Set<string>()
  const conversations = [...threads, ...contacts].filter((t) => {
    const key = `${t.account_id}:${t.id}`
    if ((scope && t.account_id !== scope.id) || seen.has(key) || !matches(t.name ?? t.id)) return false
    seen.add(key)
    return true
  })

  const results: Result[] = [
    ...(found.data && phone
      ? [
          {
            key: `phone:${found.data.account_id}:${found.data.id}`,
            section: "Số điện thoại",
            avatar: found.data.avatar,
            title: found.data.name ?? phone,
            subtitle: `${phone} · ${found.data.last_msg_at ? "đã từng nhắn" : "nhắn tin ngay"}`,
            meta: scope ? undefined : found.data.account_name,
            select: () => openThread({ accountId: found.data.account_id, threadId: found.data.id }),
          },
        ]
      : []),
    ...conversations.slice(0, MAX_PER_SECTION).map((t) => ({
      key: `thread:${t.account_id}:${t.id}`,
      section: "Hội thoại",
      avatar: t.avatar,
      title: t.name ?? t.id,
      subtitle: t.preview ?? (t.type === ThreadType.Group ? "Nhóm · chưa nhắn tin" : "Bạn bè · chưa nhắn tin"),
      meta: scope ? undefined : t.account_name,
      select: () => openThread({ accountId: t.account_id, threadId: t.id }),
    })),
    ...hits.map((m) => ({
      key: `message:${m.id}`,
      section: "Tin nhắn",
      avatar: m.thread?.avatar ?? null,
      title: m.thread?.name ?? m.thread_id,
      subtitle: `${m.is_self ? "Bạn" : (m.from_name ?? "?")}: ${getMessagePreview({ ...m, content: JSON.parse(m.raw).content })}`,
      meta: formatDate(m.ts),
      select: () => openThread({ accountId: m.account_id, threadId: m.thread_id }, m.msg_id),
    })),
  ]
  const current = Math.min(active, results.length - 1)

  function close() {
    setOpen(false)
    setQuery("")
    input.current?.blur()
  }

  function choose(r: Result) {
    r.select()
    close()
  }

  useClickOutside(root, () => setOpen(false), open)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyK") return
      e.preventDefault()
      input.current?.select()
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    document.getElementById(`search-result-${current}`)?.scrollIntoView({ block: "nearest" })
  }, [current])

  const showPanel = open && !!q

  return (
    <div ref={root} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={input}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="search-results"
        aria-activedescendant={showPanel && results.length ? `search-result-${current}` : undefined}
        aria-label="Tìm kiếm"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") return close()
          if (!showPanel || !results.length) return
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            setActive((current + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length)
          }
          if (e.key === "Enter") choose(results[current])
        }}
        placeholder={scope ? `Tìm trong ${scope.name}` : "Tìm người, nhóm, tin nhắn, số điện thoại"}
        className="pl-8 sm:pr-14"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground max-sm:hidden">
        Ctrl K
      </kbd>

      {showPanel && (
        <div
          id="search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 flex max-h-[min(70dvh,32rem)] flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in slide-in-from-top-1"
        >
          <div className="flex-1 overflow-y-auto py-1">
            {phoneStatus && <p className={cn("px-3 py-2 text-xs text-muted-foreground", found.isFetching && "animate-pulse")}>{phoneStatus}</p>}
            {results.length ? (
              results.map((r, i) => (
                <Fragment key={r.key}>
                  {r.section !== results[i - 1]?.section && <p className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">{r.section}</p>}
                  <button
                    id={`search-result-${i}`}
                    role="option"
                    aria-selected={i === current}
                    onMouseMove={() => i !== current && setActive(i)}
                    onClick={() => choose(r)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors", i === current && "bg-muted")}
                  >
                    <Avatar>
                      {r.avatar && <AvatarImage src={r.avatar} />}
                      <AvatarFallback>{r.title[0]}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        <HighlightText text={r.title} query={q} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <HighlightText text={r.subtitle} query={q} />
                      </span>
                    </span>
                    {r.meta && <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">{r.meta}</span>}
                  </button>
                </Fragment>
              ))
            ) : (
              !phoneStatus && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Không tìm thấy kết quả cho "{query.trim()}"</p>
            )}
          </div>
          <footer className="flex gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground max-sm:hidden">
            <span>
              <kbd className="font-sans">↑↓</kbd> chọn
            </span>
            <span>
              <kbd className="font-sans">Enter</kbd> mở
            </span>
            <span>
              <kbd className="font-sans">Esc</kbd> đóng
            </span>
          </footer>
        </div>
      )}
    </div>
  )
}
