import { create } from "zustand"
import { persist } from "zustand/middleware"
import { invoke } from "@tauri-apps/api/core"
import type { MediaPrefs } from "@/app/settings/models/settings.model"

type SettingsState = {
  media: MediaPrefs
  setMedia: (p: Partial<MediaPrefs>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      media: { mic: "", speaker: "", camera: "", noiseSuppression: false, micGain: true },
      setMedia: (p) => set((s) => ({ media: { ...s.media, ...p } })),
    }),
    { name: "settings" },
  ),
)


export function initSettings() {
  const sendMediaPrefs = () => invoke("media_prefs", { prefs: useSettingsStore.getState().media }).catch(console.warn)
  sendMediaPrefs()
  useSettingsStore.subscribe(sendMediaPrefs)
}
