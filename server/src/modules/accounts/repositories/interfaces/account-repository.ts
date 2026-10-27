import type { Credentials } from '@hwqnq/zca-js'
import type { Account, AccountState } from '../../../../types'

export default interface IAccountRepository {
  list(): Omit<Account, 'status'>[]
  credentials(id: string): Credentials | undefined
  upsert(id: string, name: string, avatar: string, credentials: Credentials): void
  setState(id: string, state: AccountState): boolean
  remove(id: string): boolean
}
