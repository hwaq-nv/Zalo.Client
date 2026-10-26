import { Hono } from 'hono'
import { z } from 'zod'
import { docs, ok, validate } from '../../core'
import { UpdateAccountStateRequest } from './dtos/requests/account.request'
import { Account } from './dtos/responses/account.response'
import type IAccountService from './services/interfaces/account-service'

export const accountRoutes = (accounts: IAccountService) =>
  new Hono()
    .get('/', docs('accounts', z.array(Account)), (c) => ok(c, accounts.list()))
    .post('/login-qr', docs('accounts', z.null(), 202), (c) => {
      accounts.startLoginQR()
      return ok(c, null, 'accepted', 202)
    })
    .post('/:id/reconnect', docs('accounts', z.null(), 202), (c) => {
      accounts.reconnect(c.req.param('id'))
      return ok(c, null, 'accepted', 202)
    })
    .patch('/:id', docs('accounts'), validate('json', UpdateAccountStateRequest), (c) => {
      accounts.setState(c.req.param('id'), c.req.valid('json'))
      return ok(c, null)
    })
    .delete('/:id', docs('accounts'), (c) => {
      accounts.remove(c.req.param('id'))
      return ok(c, null)
    })
