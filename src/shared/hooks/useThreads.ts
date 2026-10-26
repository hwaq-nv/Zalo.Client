import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import type { ThreadRow } from "@/shared/types"
import { api } from "@/core/http/api"
import { queryClient } from "@/core/http/query-client"
import { queryKeys } from "@/shared/constants/api.constants"
import { useUiStore } from "@/shared/stores/ui.store"

export const useThreads = () => useQuery({ queryKey: queryKeys.threads, queryFn: () => api<ThreadRow[]>("/threads") })

const collator = new Intl.Collator("vi")
const sortByName = (rows: ThreadRow[]) => [...rows].sort((a, b) => collator.compare(a.name ?? a.id, b.name ?? b.id))

export const useThreadContacts = (accountId?: string) =>
  useQuery({
    queryKey: queryKeys.threadContacts(accountId ?? ""),
    queryFn: accountId ? () => api<ThreadRow[]>(`/threads/contacts?accountId=${accountId}`) : skipToken,
    select: sortByName,
  })

export function useActiveThread() {
  const active = useUiStore((s) => s.active)
  const match = (t: ThreadRow) => t.account_id === active?.accountId && t.id === active.threadId
  const thread = useThreads().data?.find(match)
  // Bạn bè, nhóm chưa nhắn lần nào thì chưa có trong /threads
  const contact = useThreadContacts(thread ? undefined : active?.accountId).data?.find(match)
  return thread ?? contact
}

export function useUnreadByAccount() {
  const unread = new Map<string, number>()
  for (const t of useThreads().data ?? []) unread.set(t.account_id, (unread.get(t.account_id) ?? 0) + t.unread)
  return unread
}

export const useMarkRead = () =>
  useMutation({
    mutationFn: ({ accountId, threadId }: { accountId: string; threadId: string }) =>
      api(`/threads/${accountId}/${threadId}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
  })
