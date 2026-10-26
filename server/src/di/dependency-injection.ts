import type { Database } from 'bun:sqlite'
import { Container } from 'inversify'
import { db } from '../dbs/sqlite'
import CallService from '../modules/calls/services/implements/call-service'
import type ICallService from '../modules/calls/services/interfaces/call-service'
import AccountRepository from '../modules/accounts/repositories/implements/account-repository'
import type IAccountRepository from '../modules/accounts/repositories/interfaces/account-repository'
import AccountService from '../modules/accounts/services/implements/account-service'
import type IAccountService from '../modules/accounts/services/interfaces/account-service'
import ContactRepository from '../modules/contacts/repositories/implements/contact-repository'
import type IContactRepository from '../modules/contacts/repositories/interfaces/contact-repository'
import ContactService from '../modules/contacts/services/implements/contact-service'
import type IContactService from '../modules/contacts/services/interfaces/contact-service'
import MessageRepository from '../modules/messages/repositories/implements/message-repository'
import type IMessageRepository from '../modules/messages/repositories/interfaces/message-repository'
import MessageService from '../modules/messages/services/implements/message-service'
import type IMessageService from '../modules/messages/services/interfaces/message-service'
import ThreadRepository from '../modules/threads/repositories/implements/thread-repository'
import type IThreadRepository from '../modules/threads/repositories/interfaces/thread-repository'
import ThreadService from '../modules/threads/services/implements/thread-service'
import type IThreadService from '../modules/threads/services/interfaces/thread-service'
import { ZaloClient } from '../third-party/zalo/zalo-client'
import { TOKENS } from './tokens'

export function createContainer(database: Database = db) {
  const c = new Container({ defaultScope: 'Singleton' })
  c.bind<Database>(TOKENS.Database).toConstantValue(database)
  c.bind(ZaloClient).toSelf()
  c.bind<IAccountRepository>(TOKENS.AccountRepository).to(AccountRepository)
  c.bind<IAccountService>(TOKENS.AccountService).to(AccountService)
  c.bind<IContactRepository>(TOKENS.ContactRepository).to(ContactRepository)
  c.bind<IContactService>(TOKENS.ContactService).to(ContactService)
  c.bind<IThreadRepository>(TOKENS.ThreadRepository).to(ThreadRepository)
  c.bind<IThreadService>(TOKENS.ThreadService).to(ThreadService)
  c.bind<IMessageRepository>(TOKENS.MessageRepository).to(MessageRepository)
  c.bind<IMessageService>(TOKENS.MessageService).to(MessageService)
  c.bind<ICallService>(TOKENS.CallService).to(CallService)
  return c
}
