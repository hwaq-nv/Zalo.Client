import { create } from "zustand"
import type { SidebarTab } from "@/shared/models/sidebar.model"

type ActiveThread = { accountId: string; threadId: string }

type UiState = {
  tab: SidebarTab
  active?: ActiveThread
  accountId?: string
  query: string
  setTab: (tab: SidebarTab) => void
  openThread: (t?: ActiveThread) => void
  selectAccount: (accountId?: string) => void
  setQuery: (query: string) => void
}

// Cửa sổ hẹp (< md) chỉ hiện list hoặc chat, nên đổi list thì phải đóng chat
const isNarrowScreen = () => matchMedia("(width < 48rem)").matches

export const useUiStore = create<UiState>()((set) => ({
  tab: "messages",
  query: "",
  setTab: (tab) => set((s) => ({ tab, active: isNarrowScreen() ? undefined : s.active })),
  openThread: (active) => set({ active }),
  selectAccount: (accountId) =>
    set((s) => ({ accountId, tab: s.tab === "accounts" ? "messages" : s.tab, active: isNarrowScreen() ? undefined : s.active })),
  setQuery: (query) => set((s) => ({ query, tab: query ? "messages" : s.tab, active: query && isNarrowScreen() ? undefined : s.active })),
}))
