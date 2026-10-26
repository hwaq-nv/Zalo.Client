import { Hono } from 'hono'
import { z } from 'zod'
import { apiDocs, successResponse, validate } from '../../core'
import { UpdateAccountStateRequest } from './dtos/requests/account.request'
import { Account } from './dtos/responses/account.response'
import type IAccountService from './services/interfaces/account-service'

export const accountRoutes = (accounts: IAccountService) =>
  new Hono()
    .get('/', apiDocs('accounts', z.array(Account)), (c) => successResponse(c, accounts.list()))
    .post('/login-qr', apiDocs('accounts', z.null(), 202), (c) => {
      accounts.startLoginQR()
      return successResponse(c, null, 'accepted', 202)
    })
    .post('/:id/reconnect', apiDocs('accounts', z.null(), 202), (c) => {
      accounts.reconnect(c.req.param('id'))
      return successResponse(c, null, 'accepted', 202)
    })
    .patch('/:id', apiDocs('accounts'), validate('json', UpdateAccountStateRequest), (c) => {
      accounts.setState(c.req.param('id'), c.req.valid('json'))
      return successResponse(c, null)
    })
    .delete('/:id', apiDocs('accounts'), (c) => {
      accounts.remove(c.req.param('id'))
      return successResponse(c, null)
    })
