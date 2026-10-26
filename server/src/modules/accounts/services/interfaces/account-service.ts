import type { Account } from '../../../../types'
import type { UpdateAccountStateRequest } from '../../dtos/requests/account.request'

export default interface IAccountService {
  list(): Account[]
  startLoginQR(): void
  restore(): void
  reconnect(id: string): void
  setState(id: string, body: UpdateAccountStateRequest): void
  remove(id: string): void
}
