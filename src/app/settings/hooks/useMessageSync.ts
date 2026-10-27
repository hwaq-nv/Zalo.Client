import { useMutation, useQuery } from "@tanstack/react-query"
import type { SyncState } from "@/shared/types"
import { api } from "@/core/http/api"
import { queryKeys } from "@/shared/constants/api.constants"

export const useSyncState = (accountId: string) =>
  useQuery({ queryKey: queryKeys.syncState(accountId), queryFn: () => api<SyncState>(`/threads/${accountId}/sync`), enabled: !!accountId })

export const useRequestSync = () =>
  useMutation({ mutationFn: (accountId: string) => api<SyncState>(`/threads/${accountId}/sync`, { method: "POST" }) })

export const useCancelSync = () => useMutation({ mutationFn: (accountId: string) => api(`/threads/${accountId}/sync`, { method: "DELETE" }) })
