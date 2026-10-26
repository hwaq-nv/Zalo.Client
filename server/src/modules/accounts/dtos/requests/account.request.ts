import { z } from 'zod'
import { AccountState } from '../responses/account.response'

export const UpdateAccountStateRequest = z.object({ state: AccountState })
export type UpdateAccountStateRequest = z.infer<typeof UpdateAccountStateRequest>
