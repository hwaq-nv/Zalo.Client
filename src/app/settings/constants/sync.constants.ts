import type { SyncState } from "@/shared/types"

export const SYNC_BUSY_STATUSES: SyncState["status"][] = ["requested", "confirmed", "importing"]

export const SYNC_STATUS_TEXT: Record<SyncState["status"], string> = {
  idle: "Bấm Đồng bộ rồi xác nhận trên điện thoại",
  requested: "Mở Zalo trên điện thoại và bấm xác nhận",
  confirmed: "Điện thoại đang chuẩn bị bản sao lưu...",
  importing: "Đang tải và nhập tin nhắn...",
  completed: "Đã đồng bộ xong",
  rejected: "Điện thoại đã từ chối",
  failed: "Đồng bộ thất bại",
  cancelled: "Đã huỷ",
}
