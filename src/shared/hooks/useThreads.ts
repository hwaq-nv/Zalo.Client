import { skipToken, useMutation, useQueries, useQuery } from "@tanstack/react-query"
import type { Presence, ThreadRow } from "@/shared/types"
import { ThreadType } from "@/shared/enums/thread.enums"
import { api } from "@/core/http/api"
import { queryClient } from "@/core/http/query-client"
import { queryKeys } from "@/shared/constants/api.constants"
import { useUiStore } from "@/shared/stores/ui.store"

export const useThreads = () => useQuery({ queryKey: queryKeys.threads, queryFn: () => api<ThreadRow[]>("/threads") })

const collator = new Intl.Collator("vi")
const sortByName = (rows: ThreadRow[]) => [...rows].sort((a, b) => collator.compare(a.name ?? a.id, b.name ?? b.id))

const fetchThreadContacts = (accountId: string) => api<ThreadRow[]>(`/threads/contacts?accountId=${accountId}`)

export const useThreadContacts = (accountId?: string) =>
  useQuery({
    queryKey: queryKeys.threadContacts(accountId ?? ""),
    queryFn: accountId ? () => fetchThreadContacts(accountId) : skipToken,
    select: sortByName,
  })

export const useAllThreadContacts = (accountIds: string[]) =>
  useQueries({
    queries: accountIds.map((id) => ({ queryKey: queryKeys.threadContacts(id), queryFn: () => fetchThreadContacts(id) })),
    combine: (results) => results.flatMap((r) => r.data ?? []),
  })


export const usePresence = (thread: ThreadRow) =>
  useQuery({
    queryKey: queryKeys.presence(thread.account_id, thread.id),
    queryFn: () => api<Presence>(`/threads/${thread.account_id}/${thread.id}/presence`),
    enabled: thread.type === ThreadType.User,
    refetchInterval: 60_000,
    retry: false,
  })

export function useActiveThread() {
  const active = useUiStore((s) => s.active)
  const match = (t: ThreadRow) => t.account_id === active?.accountId && t.id === active.threadId
  const thread = useThreads().data?.find(match)
  const contacts = useThreadContacts(thread ? undefined : active?.accountId)
  const contact = contacts.data?.find(match)
  const stranger = useQuery({
    queryKey: queryKeys.threadInfo(active?.accountId ?? "", active?.threadId ?? ""),
    queryFn: () => api<ThreadRow>(`/threads/${active!.accountId}/${active!.threadId}/info`),
    enabled: !!active && !thread && contacts.isSuccess && !contact,
  }).data
  return thread ?? contact ?? stranger
}

export const useFindByPhone = (accountId: string | undefined, phone: string | null) =>
  useQuery({
    queryKey: queryKeys.findByPhone(accountId ?? "", phone ?? ""),
    queryFn: accountId && phone ? () => api<ThreadRow>(`/threads/find?${new URLSearchParams({ accountId, phone })}`) : skipToken,
    retry: false,
  })

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
