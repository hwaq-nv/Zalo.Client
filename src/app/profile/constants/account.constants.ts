import type { AccountState, AccountStatus } from "@/shared/types"

export const ACCOUNT_STATUSES: Record<AccountStatus, { label: string; dot: string }> = {
  online: { label: "Đang hoạt động", dot: "bg-emerald-500" },
  connecting: { label: "Đang kết nối", dot: "bg-amber-500" },
  offline: { label: "Mất kết nối", dot: "bg-muted-foreground" },
  kicked: { label: "Đã đăng nhập ở nơi khác", dot: "bg-destructive" },
}

export const ACCOUNT_STATES: Record<Exclude<AccountState, "active">, string> = { locked: "Bị khoá", retired: "Ngừng dùng" }
