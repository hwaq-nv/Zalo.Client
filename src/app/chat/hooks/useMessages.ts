import { keepPreviousData, skipToken, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import type { MessageRow, Receipt, ServerEvent, Sticker } from "@/shared/types"
import { api } from "@/core/http/api"
import { queryKeys } from "@/shared/constants/api.constants"
import { useThreads } from "@/shared/hooks/useThreads"
import { PAGE_SIZE } from "@/app/chat/constants/chat.constants"
import { flattenMessages, getImageDims } from "@/app/chat/utils/chat.utils"

export const useMessages = (accountId: string, threadId: string) =>
  useInfiniteQuery({
    queryKey: queryKeys.messages(accountId, threadId),
    queryFn: ({ pageParam }) =>
      api<MessageRow[]>(`/threads/${accountId}/${threadId}/messages${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : last.at(-1)!.msg_id),
    select: flattenMessages,
  })

// Tin của mình về lại qua event message (selfListen) nên không cần invalidate. quoteMsgId = trả lời tin đó.
// Có tệp thì đi đường attachments (multipart), chữ đi kèm trong cùng request
export const useSendMessage = (accountId: string, threadId: string) =>
  useMutation({
    mutationFn: async ({ files = [], ...body }: { text: string; quoteMsgId?: string; files?: File[] }) => {
      if (!files.length)
        return api(`/threads/${accountId}/${threadId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      const form = new FormData()
      const dims = await Promise.all(files.map(getImageDims))
      files.forEach((f, i) => {
        form.append("file[]", f)
        form.append("dims[]", dims[i])
      })
      form.append("text", body.text)
      if (body.quoteMsgId) form.append("quoteMsgId", body.quoteMsgId)
      return api(`/threads/${accountId}/${threadId}/attachments`, { method: "POST", body: form })
    },
  })

export const useSendSticker = (accountId: string, threadId: string) =>
  useMutation({
    mutationFn: (sticker: Sticker) =>
      api(`/threads/${accountId}/${threadId}/stickers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sticker),
      }),
    onError: (e) => toast.error("Không gửi được sticker", { description: e.message }),
  })

// Kết quả về qua WS 'reaction'; icon "" = gỡ hết cảm xúc của mình trên tin
export const useReact = (accountId: string, threadId: string) =>
  useMutation({
    mutationFn: ({ msgId, icon }: { msgId: string; icon: string }) =>
      api(`/threads/${accountId}/${threadId}/messages/${msgId}/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ icon }),
      }),
    onError: (e) => toast.error("Không thả được cảm xúc", { description: e.message }),
  })

// Kết quả về qua WS 'undo'
export const useRecall = (accountId: string, threadId: string) =>
  useMutation({
    mutationFn: (msgId: string) => api(`/threads/${accountId}/${threadId}/messages/${msgId}`, { method: "DELETE" }),
    onError: (e) => toast.error("Không thu hồi được tin", { description: e.message }),
  })

export const useReceipts = (accountId: string, threadId: string) =>
  useQuery({
    queryKey: queryKeys.receipts(accountId, threadId),
    queryFn: () => api<Receipt[]>(`/threads/${accountId}/${threadId}/receipts`),
  })

// Chỉ đến từ WS (core/websocket/events.ts tự xoá sau vài giây), không fetch
export const useTyping = (accountId: string, threadId: string) =>
  useQuery<Extract<ServerEvent, { type: "typing" }> | null>({ queryKey: queryKeys.typing(accountId, threadId), queryFn: skipToken }).data

// q rỗng = sticker mình từng gửi (mọi nick); tìm theo từ khoá đi qua Zalo nên cần nick online.
// staleTime 0: mỗi lần mở bảng lấy lại, sticker vừa gửi lên đầu
export const useStickers = (accountId: string, q: string) =>
  useQuery({
    queryKey: queryKeys.stickers(accountId, q),
    queryFn: () => api<Sticker[]>(q ? `/threads/stickers/search?${new URLSearchParams({ accountId, q })}` : "/threads/stickers/recent"),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

// mỗi phím gõ là một request, server local + FTS nên chưa cần debounce
export function useSearchMessages(q: string, accountId?: string) {
  const threads = useThreads().data
  const enabled = q.length >= 2
  const { data } = useQuery({
    queryKey: queryKeys.search(q, accountId),
    queryFn: () => api<MessageRow[]>(`/threads/search?${new URLSearchParams({ q, ...(accountId && { accountId }) })}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
  if (!enabled) return []
  return (data ?? []).map((m) => ({ ...m, thread: threads?.find((t) => t.account_id === m.account_id && t.id === m.thread_id) }))
}
