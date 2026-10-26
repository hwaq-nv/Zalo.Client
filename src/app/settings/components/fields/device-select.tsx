import { useId } from "react"
import { Field, FieldLabel } from "@/shared/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select"
import { DEFAULT_DEVICE } from "@/app/settings/constants/media.constants"

type Props = { label: string; value: string; names?: string[]; onChange: (v: string) => void }

export const DeviceSelect = ({ label, value, names, onChange }: Props) => {
  const id = useId()
  const options = [...new Set(names)].filter(Boolean)
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value || DEFAULT_DEVICE} onValueChange={(v) => onChange(v === DEFAULT_DEVICE ? "" : v)}>
        <SelectTrigger id={id} className="w-72 min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_DEVICE}>Mặc định</SelectItem>
          {value && !options.includes(value) && <SelectItem value={value}>{value} (không thấy)</SelectItem>}
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
