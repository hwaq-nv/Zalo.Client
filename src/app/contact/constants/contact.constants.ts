import { ThreadType } from "@/shared/enums/thread.enums"

export const CONTACT_KINDS = [
  { type: ThreadType.User, label: "Bạn bè" },
  { type: ThreadType.Group, label: "Nhóm" },
] as const
