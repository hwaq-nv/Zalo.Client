import { inject, injectable } from 'inversify'
import { LoginQRCallbackEventType, ZaloApiError, ZaloApiLoginQRAborted, type API } from '@hwqnq/zca-js'
import { broadcast, logger, NotFoundError } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import { ZaloClient } from '../../../../third-party/zalo/zalo-client'
import type { Account, AccountStatus } from '../../../../types'
import type { UpdateAccountStateRequest } from '../../dtos/requests/account.request'
import type IAccountRepository from '../../repositories/interfaces/account-repository'
import type IAccountService from '../interfaces/account-service'

@injectable()
export default class AccountService implements IAccountService {
  private statuses = new Map<string, AccountStatus>()
  private abortQR?: () => unknown

  constructor(
    private zalo: ZaloClient,
    @inject(TOKENS.AccountRepository) private accounts: IAccountRepository,
  ) {
    zalo.on('status', (id, status) => this.setStatus(id, status))
  }

  list(): Account[] {
    return this.accounts.list().map((a) => ({ ...a, status: this.statuses.get(a.id) ?? 'offline' }))
  }

  startLoginQR() {
    this.abortQR?.()
    this.zalo
      .loginQR((e) => {
        switch (e.type) {
          case LoginQRCallbackEventType.QRCodeGenerated:
            this.abortQR = e.actions.abort
            return broadcast({ type: 'qr', image: `data:image/png;base64,${e.data.image}` })
          case LoginQRCallbackEventType.QRCodeScanned:
            return broadcast({ type: 'qr-scanned', name: e.data.display_name, avatar: e.data.avatar })
          case LoginQRCallbackEventType.QRCodeExpired:
          case LoginQRCallbackEventType.QRCodeDeclined:
            e.actions.abort()
            return broadcast({ type: 'qr-failed' })
        }
      })
      .then(async (api) => {
        this.abortQR = undefined
        await this.onLoggedIn(api)
        broadcast({ type: 'qr-done', id: api.getOwnId() })
      })
      .catch((err) => {
        if (err instanceof ZaloApiLoginQRAborted) return
        logger.error('loginQR', { err })
        broadcast({ type: 'qr-failed' })
      })
  }

  restore() {
    for (const { id, state } of this.accounts.list()) if (state === 'active') this.reconnect(id)
  }

  setState(id: string, { state }: UpdateAccountStateRequest) {
    if (!this.accounts.setState(id, state)) throw new NotFoundError('account not found')
    if (state === 'active') return this.reconnect(id)
    this.zalo.detach(id)
    this.setStatus(id, 'offline')
  }

  reconnect(id: string) {
    const credentials = this.accounts.credentials(id)
    if (!credentials) throw new NotFoundError('account not found')
    this.setStatus(id, 'connecting')
    this.zalo
      .login(credentials)
      .then((api) => this.onLoggedIn(api))
      .catch((err) => {
        logger.error('login', { id, err, code: err instanceof ZaloApiError ? err.code : undefined })
        this.setStatus(id, 'offline')
      })
  }

  remove(id: string) {
    if (!this.accounts.remove(id)) throw new NotFoundError('account not found')
    this.zalo.detach(id)
    this.statuses.delete(id)
  }

  private async onLoggedIn(api: API) {
    const id = api.getOwnId()
    const { profile } = await api.fetchAccountInfo()
    this.accounts.upsert(id, profile.displayName, profile.avatar, this.zalo.getCredentials(api))
    this.zalo.attach(id, api)
  }

  private setStatus(id: string, status: AccountStatus) {
    this.statuses.set(id, status)
    broadcast({ type: 'account', id, status })
  }
}
