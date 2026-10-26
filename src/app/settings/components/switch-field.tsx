import { useId } from "react"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/shared/components/ui/field"
import { Switch } from "@/shared/components/ui/switch"

type Props = { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }

export function SwitchField(p: Props) {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{p.label}</FieldLabel>
        <FieldDescription>{p.hint}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={p.checked} onCheckedChange={p.onChange} />
    </Field>
  )
}
