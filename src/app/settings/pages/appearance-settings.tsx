import { Field, FieldGroup, FieldLegend, FieldSet, FieldTitle } from "@/shared/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group"
import { type Theme, useThemeStore } from "@/shared/stores/theme.store"
import { FONT_SIZES, THEMES } from "@/app/settings/constants/appearance.constants"

export function AppearanceSettings() {
  const { theme, fontSize, setTheme, setFontSize } = useThemeStore()
  return (
    <FieldSet>
      <FieldLegend>Giao diện</FieldLegend>
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldTitle className="flex-auto">Chủ đề</FieldTitle>
          <ToggleGroup type="single" size="sm" aria-label="Chủ đề" value={theme} onValueChange={(v) => v && setTheme(v as Theme)}>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value}>
                <Icon /> {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field orientation="horizontal">
          <FieldTitle className="flex-auto">Cỡ chữ</FieldTitle>
          <ToggleGroup
            type="single"
            size="sm"
            aria-label="Cỡ chữ"
            value={String(fontSize)}
            onValueChange={(v) => v && setFontSize(Number(v))}
          >
            {FONT_SIZES.map(({ value, label }) => (
              <ToggleGroupItem key={value} value={String(value)}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
