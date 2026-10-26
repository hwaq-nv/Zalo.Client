import { FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSet } from "@/shared/components/ui/field"
import { DeviceSelect } from "@/app/settings/components/device-select"
import { SwitchField } from "@/app/settings/components/switch-field"
import { useMediaDevices } from "@/app/settings/hooks/useMediaDevices"
import { useSettingsStore } from "@/app/settings/stores/settings.store"

export function CallSettings() {
  const { media, setMedia } = useSettingsStore()
  const { data, error } = useMediaDevices()
  return (
    <FieldSet>
      <FieldLegend>Cuộc gọi</FieldLegend>
      <FieldDescription>Áp dụng từ cuộc gọi sau</FieldDescription>
      <FieldGroup>
        {error && <FieldError>Không lấy được danh sách thiết bị: {String(error)}</FieldError>}
        <DeviceSelect label="Micro" value={media.mic} names={data?.mics} onChange={(mic) => setMedia({ mic })} />
        <DeviceSelect label="Loa" value={media.speaker} names={data?.speakers} onChange={(speaker) => setMedia({ speaker })} />
        <DeviceSelect label="Camera" value={media.camera} names={data?.cameras} onChange={(camera) => setMedia({ camera })} />
        <SwitchField
          label="Lọc tiếng ồn"
          hint="Có thể làm mất giọng khi nói lâu hoặc nói xa micro"
          checked={media.noiseSuppression}
          onChange={(noiseSuppression) => setMedia({ noiseSuppression })}
        />
        <SwitchField
          label="Tự chỉnh âm lượng micro"
          hint="Nâng giọng nhỏ lên mức nghe rõ"
          checked={media.micGain}
          onChange={(micGain) => setMedia({ micGain })}
        />
      </FieldGroup>
    </FieldSet>
  )
}
