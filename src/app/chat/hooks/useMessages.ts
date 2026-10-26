import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import type { MessageRow } from "@/shared/types"
import { api } from "@/core/http/api"
import { qk } from "@/shared/constants/api.constants"
import { useThreads } from "@/shared/hooks/useThreads"
import { PAGE_SIZE } from "@/app/chat/constants/chat.constants"
import { flatten } from "@/app/chat/utils/chat.utils"

export const useMessages = (accountId: string, threadId: string) =>
  useInfiniteQuery({
    queryKey: qk.messages(accountId, threadId),
    queryFn: ({ pageParam }) =>
      api<MessageRow[]>(`/threads/${accountId}/${threadId}/messages${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : last.at(-1)!.msg_id),
    select: flatten,
  })

// Tin của mình về lại qua event message (selfListen) nên không cần invalidate
export const useSend = (accountId: string, threadId: string) =>
  useMutation({
    mutationFn: (text: string) =>
      api(`/threads/${accountId}/${threadId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }),
  })

// ponytail: mỗi phím gõ là một request, server local + FTS nên chưa cần debounce
export function useSearchMessages(q: string, accountId?: string) {
  const threads = useThreads().data
  const enabled = q.length >= 2
  const { data } = useQuery({
    queryKey: qk.search(q, accountId),
    queryFn: () => api<MessageRow[]>(`/threads/search?${new URLSearchParams({ q, ...(accountId && { accountId }) })}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
  if (!enabled) return []
  return (data ?? []).map((m) => ({ ...m, thread: threads?.find((t) => t.account_id === m.account_id && t.id === m.thread_id) }))
}
