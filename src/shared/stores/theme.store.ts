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

const darkModeQuery = matchMedia("(prefers-color-scheme: dark)")

function applyTheme() {
  const { theme, fontSize } = useThemeStore.getState()
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && darkModeQuery.matches))
  document.documentElement.style.fontSize = `${fontSize}px`
}

export function initTheme() {
  applyTheme()
  useThemeStore.subscribe(applyTheme)
  darkModeQuery.addEventListener("change", applyTheme)
}
