import { create } from "zustand"
import type { SidebarTab } from "@/shared/models/sidebar.model"

type ActiveThread = { accountId: string; threadId: string }

type UiState = {
  tab: SidebarTab
  active?: ActiveThread
  // msg_id cần cuộn tới trong hội thoại đang mở; MessageList kéo thêm tin cũ cho tới khi gặp rồi xoá
  jumpTo?: string
  accountId?: string
  setTab: (tab: SidebarTab) => void
  openThread: (t?: ActiveThread, jumpTo?: string) => void
  setJumpTo: (msgId?: string) => void
  selectAccount: (accountId?: string) => void
}

// Cửa sổ hẹp (< md) chỉ hiện list hoặc chat, nên đổi list thì phải đóng chat
const isNarrowScreen = () => matchMedia("(width < 48rem)").matches

export const useUiStore = create<UiState>()((set) => ({
  tab: "messages",
  setTab: (tab) => set((s) => ({ tab, active: isNarrowScreen() ? undefined : s.active })),
  openThread: (active, jumpTo) => set({ active, jumpTo }),
  setJumpTo: (jumpTo) => set({ jumpTo }),
  selectAccount: (accountId) =>
    set((s) => ({ accountId, tab: s.tab === "accounts" ? "messages" : s.tab, active: isNarrowScreen() ? undefined : s.active })),
}))
