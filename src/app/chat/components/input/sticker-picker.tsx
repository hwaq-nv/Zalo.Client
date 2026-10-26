import { useState } from "react"
import { Sticker as StickerIcon } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover"
import { Skeleton } from "@/shared/components/ui/skeleton"
import type { ThreadRow } from "@/shared/types"
import { cn } from "@/shared/utils/shadcn"
import useDebounce from "@/core/hooks/useDebounce"
import { useSendSticker, useStickers } from "@/app/chat/hooks/useMessages"
import { getStickerUrl } from "@/app/chat/utils/chat.utils"

export const StickerPicker = ({ thread }: { thread: ThreadRow }) => {
  const [q, setQ] = useState("")
  const query = useDebounce(q.trim(), 300)
  const { data: stickers = [], isPending, error, isPlaceholderData } = useStickers(thread.account_id, query)
  const send = useSendSticker(thread.account_id, thread.id)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" title="Sticker">
          <StickerIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="flex w-80 flex-col gap-2 p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm sticker: vui, buồn, cảm ơn..." />
        <div className={cn("grid h-64 grid-cols-4 content-start gap-1 overflow-y-auto transition-opacity", isPlaceholderData && "opacity-50")}>
          {isPending ? (
            Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)
          ) : error ? (
            <p className="col-span-full p-2 text-xs text-destructive">{error.message}</p>
          ) : !stickers.length ? (
            <p className="col-span-full px-4 py-10 text-center text-xs text-muted-foreground">
              {query ? `Không có sticker nào cho "${query}"` : "Chưa gửi sticker nào. Gõ từ khoá để tìm."}
            </p>
          ) : (
            stickers.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => send.mutate(s)}
                className="aspect-square rounded-lg p-1 transition-transform duration-200 animate-in fade-in zoom-in-90 fill-mode-backwards hover:scale-110 hover:bg-muted active:scale-95"
                style={{ animationDelay: `${Math.min(i, 16) * 15}ms` }}
              >
                <img src={getStickerUrl(s.id)} alt="Sticker" loading="lazy" className="size-full object-contain" />
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
