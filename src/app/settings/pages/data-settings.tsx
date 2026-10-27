import { useId, useState } from "react"
import { useAccounts, useSelectedAccount } from "@/app/profile/hooks/useAccounts"
import { SYNC_BUSY_STATUSES, SYNC_STATUS_TEXT } from "@/app/settings/constants/sync.constants"
import { useCancelSync, useRequestSync, useSyncState } from "@/app/settings/hooks/useMessageSync"
import { Button } from "@/shared/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/shared/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select"

export const DataSettings = () => {
  const id = useId()
  const accounts = useAccounts().data?.filter((a) => a.state === "active") ?? []
  const selected = useSelectedAccount()
  const [picked, setPicked] = useState("")
  const accountId = picked || selected?.id || accounts[0]?.id || ""
  const { data: sync = { status: "idle" } } = useSyncState(accountId)
  const request = useRequestSync()
  const cancel = useCancelSync()
  const busy = SYNC_BUSY_STATUSES.includes(sync.status)
  const error = sync.error ?? request.error?.message

  return (
    <FieldSet>
      <FieldLegend>Dữ liệu</FieldLegend>
      <FieldDescription>Chép lịch sử tin nhắn từ Zalo trên điện thoại về máy này</FieldDescription>
      <FieldGroup>
        {accounts.length > 1 && (
          <Field orientation="horizontal">
            <FieldLabel htmlFor={id}>Tài khoản</FieldLabel>
            <Select value={accountId} onValueChange={setPicked} disabled={busy}>
              <SelectTrigger id={id} className="w-72 min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel>Đồng bộ tin nhắn từ điện thoại</FieldLabel>
            <FieldDescription>
              {SYNC_STATUS_TEXT[sync.status]}
              {sync.imported !== undefined && `, thêm ${sync.imported} tin mới`}
            </FieldDescription>
          </FieldContent>
          {busy ? (
            <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(accountId)}>
              Huỷ
            </Button>
          ) : (
            <Button disabled={!accountId || request.isPending} onClick={() => request.mutate(accountId)}>
              Đồng bộ
            </Button>
          )}
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </FieldSet>
  )
}
