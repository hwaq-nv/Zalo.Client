import { useId } from "react"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/shared/components/ui/field"
import { Switch } from "@/shared/components/ui/switch"

type Props = { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }

export const SwitchField = ({ label, hint, checked, onChange }: Props) => {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}
