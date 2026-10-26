export const qk = {
  accounts: ["accounts"],
  threads: ["threads"],
  threadContacts: (accountId: string) => ["threads", "contacts", accountId],
  messages: (accountId: string, threadId?: string) =>
    threadId ? ["messages", accountId, threadId] : ["messages", accountId],
  search: (q: string, accountId = "") => ["search", q, accountId],
  loginQr: ["login-qr"],
  mediaDevices: ["media-devices"],
  groupCallMembers: (accountId: string, groupId: string) => ["calls", "members", accountId, groupId],
}
