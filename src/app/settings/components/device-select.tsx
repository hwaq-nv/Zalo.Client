import { useId } from "react"
import { Field, FieldLabel } from "@/shared/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select"
import { DEFAULT_DEVICE } from "@/app/settings/constants/media.constants"

type Props = { label: string; value: string; names?: string[]; onChange: (v: string) => void }

export function DeviceSelect(p: Props) {
  const id = useId()
  const names = [...new Set(p.names)].filter(Boolean)
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>{p.label}</FieldLabel>
      <Select value={p.value || DEFAULT_DEVICE} onValueChange={(v) => p.onChange(v === DEFAULT_DEVICE ? "" : v)}>
        <SelectTrigger id={id} className="w-72 min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_DEVICE}>Mặc định</SelectItem>
          {p.value && !names.includes(p.value) && <SelectItem value={p.value}>{p.value} (không thấy)</SelectItem>}
          {names.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
