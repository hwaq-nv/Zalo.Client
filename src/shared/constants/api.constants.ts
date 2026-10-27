export const queryKeys = {
  accounts: ["accounts"],
  threads: ["threads"],
  threadContacts: (accountId: string) => ["threads", "contacts", accountId],
  threadInfo: (accountId: string, threadId: string) => ["threads", "info", accountId, threadId],
  findByPhone: (accountId: string, phone: string) => ["threads", "find", accountId, phone],
  messages: (accountId: string, threadId?: string) =>
    threadId ? ["messages", accountId, threadId] : ["messages", accountId],
  search: (q: string, accountId = "") => ["search", q, accountId],
  stickers: (accountId: string, q: string) => ["stickers", accountId, q],
  receipts: (accountId: string, threadId: string) => ["receipts", accountId, threadId],
  presence: (accountId: string, userId: string) => ["presence", accountId, userId],
  typing: (accountId: string, threadId: string) => ["typing", accountId, threadId],
  loginQr: ["login-qr"],
  syncState: (accountId: string) => ["sync", accountId],
  mediaDevices: ["media-devices"],
  groupCallMembers: (accountId: string, groupId: string) => ["calls", "members", accountId, groupId],
}
