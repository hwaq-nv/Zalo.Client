import { useUiStore } from "@/shared/stores/ui.store"
import type { QuotedMessage } from "@/app/chat/models/message.model"

// Bấm vào trích dẫn → cuộn tới tin gốc, tin gốc chưa tải thì MessageList kéo thêm tin cũ
export const MessageQuote = ({ quote }: { quote: QuotedMessage }) => {
  const setJumpTo = useUiStore((s) => s.setJumpTo)
  const attach = JSON.parse(quote.attach || "{}")
  return (
    <button type="button" onClick={() => setJumpTo(String(quote.globalMsgId))} className="mb-1 flex w-full gap-2 border-l-2 border-current/40 pl-2 text-left text-xs">
      {attach.thumb && <img src={attach.thumb} alt="" className="size-9 shrink-0 rounded object-cover" />}
      <span className="min-w-0">
        <span className="block font-medium">{quote.fromD}</span>
        <span className="line-clamp-2 wrap-break-word opacity-70">{quote.msg || attach.title || "[Tệp đính kèm]"}</span>
      </span>
    </button>
  )
}
