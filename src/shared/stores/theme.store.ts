import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Theme = "light" | "dark" | "system"

type ThemeState = {
  theme: Theme
  fontSize: number
  setTheme: (theme: Theme) => void
  setFontSize: (fontSize: number) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      fontSize: 16,
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: "theme" },
  ),
)

const media = matchMedia("(prefers-color-scheme: dark)")

function apply() {
  const { theme, fontSize } = useThemeStore.getState()
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches))
  document.documentElement.style.fontSize = `${fontSize}px`
}

export function initTheme() {
  apply()
  useThemeStore.subscribe(apply)
  media.addEventListener("change", apply)
}
