import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import type { Account, AccountState, ServerEvent } from "@/shared/types"
import { api } from "@/core/http/api"
import { queryClient } from "@/core/http/query-client"
import { queryKeys } from "@/shared/constants/api.constants"
import { useUiStore } from "@/shared/stores/ui.store"

export const useAccounts = () => useQuery({ queryKey: queryKeys.accounts, queryFn: () => api<Account[]>("/accounts") })

export function useSelectedAccount() {
  const accountId = useUiStore((s) => s.accountId)
  return useAccounts().data?.find((a) => a.id === accountId && a.state === "active")
}

export const useLoginQr = () => useQuery<ServerEvent | null>({ queryKey: queryKeys.loginQr, queryFn: skipToken })

export const useStartLoginQr = () =>
  useMutation({
    mutationFn: () => {
      queryClient.setQueryData(queryKeys.loginQr, null)
      return api("/accounts/login-qr", { method: "POST" })
    },
  })

export const useReconnect = () =>
  useMutation({ mutationFn: (id: string) => api(`/accounts/${id}/reconnect`, { method: "POST" }) })

export const useSetAccountState = () =>
  useMutation({
    mutationFn: ({ id, state }: { id: string; state: AccountState }) =>
      api(`/accounts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      }),
  })

export const useRemoveAccount = () =>
  useMutation({
    mutationFn: (id: string) => api(`/accounts/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) =>
      Promise.all([queryKeys.accounts, queryKeys.threads, queryKeys.messages(id)].map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  })
