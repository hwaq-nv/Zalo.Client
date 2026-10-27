import type { Database } from 'bun:sqlite'
import { inject, injectable } from 'inversify'
import type { Credentials } from '@hwqnq/zca-js'
import { TOKENS } from '../../../../di/tokens'
import type { Account, AccountState } from '../../../../types'
import type IAccountRepository from '../interfaces/account-repository'

@injectable()
export default class AccountRepository implements IAccountRepository {
  constructor(@inject(TOKENS.Database) private db: Database) {}

  list() {
    return this.db.query('SELECT id, name, avatar, state FROM accounts ORDER BY created_at, rowid').all() as Omit<Account, 'status'>[]
  }

  credentials(id: string) {
    const row = this.db.query('SELECT credentials FROM accounts WHERE id = ?').get(id) as { credentials: string } | null
    return row ? (JSON.parse(row.credentials) as Credentials) : undefined
  }

  upsert(id: string, name: string, avatar: string, credentials: Credentials) {
    this.db
      .query(
        `INSERT INTO accounts (id, name, avatar, credentials) VALUES ($id, $name, $avatar, $credentials)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, credentials = excluded.credentials,
           state = 'active', state_at = IIF(accounts.state = 'active', accounts.state_at, $now)`,
      )
      .run({ id, name, avatar, credentials: JSON.stringify(credentials), now: Date.now() })
  }

  setState(id: string, state: AccountState) {
    return this.db.query('UPDATE accounts SET state = ?, state_at = ? WHERE id = ?').run(state, Date.now(), id).changes > 0
  }

  remove(id: string) {
    return this.db.query('DELETE FROM accounts WHERE id = ?').run(id).changes > 0
  }
}
