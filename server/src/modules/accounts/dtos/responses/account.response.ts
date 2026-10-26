import { z } from 'zod'

export const AccountStatus = z.enum(['connecting', 'online', 'offline', 'kicked'])
export type AccountStatus = z.infer<typeof AccountStatus>

// Lưu trong DB: 'locked' = Zalo khoá, 'retired' = ngừng dùng. Dữ liệu của nick vẫn giữ nguyên
export const AccountState = z.enum(['active', 'locked', 'retired'])
export type AccountState = z.infer<typeof AccountState>

export const Account = z.object({ id: z.string(), name: z.string(), avatar: z.string().nullable(), status: AccountStatus, state: AccountState })
export type Account = z.infer<typeof Account>
