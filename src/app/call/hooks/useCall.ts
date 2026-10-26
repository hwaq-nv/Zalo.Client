import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import type { GroupCallMembers } from "@/shared/types"
import { api } from "@/core/http/api"
import { queryKeys } from "@/shared/constants/api.constants"
import type { StartCallRequest } from "@/app/call/models/call.model"
import { showCallEndedToast } from "@/app/call/services/call.service"

export const useStartCall = () =>
  useMutation({
    mutationFn: ({ thread, video, members }: StartCallRequest) =>
      api(`/calls/${thread.account_id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, video, members }),
      }),
    onError: (e, { thread }) => showCallEndedToast(thread.name ?? thread.id, `Không gọi được: ${e.message}`),
  })

export const useGroupCallMembers = (accountId: string, groupId?: string) =>
  useQuery({
    queryKey: queryKeys.groupCallMembers(accountId, groupId ?? ""),
    queryFn: groupId ? () => api<GroupCallMembers>(`/calls/${accountId}/groups/${groupId}/members`) : skipToken,
  })
