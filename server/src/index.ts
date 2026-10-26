import { Hono } from 'hono'
import { websocket } from 'hono/bun'
import { cors } from 'hono/cors'
import { config } from './config'
import { auth, eventsWs, useExceptionHandler, useLogger, useOpenApi, useTracing } from './core'
import { createContainer } from './di/dependency-injection'
import { TOKENS } from './di/tokens'
import { accountRoutes } from './modules/accounts'
import { callRoutes } from './modules/calls'
import type ICallService from './modules/calls/services/interfaces/call-service'
import type IAccountService from './modules/accounts/services/interfaces/account-service'
import { contactRoutes } from './modules/contacts'
import type IContactService from './modules/contacts/services/interfaces/contact-service'
import { messageRoutes } from './modules/messages'
import type IMessageService from './modules/messages/services/interfaces/message-service'
import { threadRoutes } from './modules/threads'
import type IThreadService from './modules/threads/services/interfaces/thread-service'

const container = createContainer()
const accounts = container.get<IAccountService>(TOKENS.AccountService)
const contacts = container.get<IContactService>(TOKENS.ContactService)
const threads = container.get<IThreadService>(TOKENS.ThreadService)
const messages = container.get<IMessageService>(TOKENS.MessageService)
const calls = container.get<ICallService>(TOKENS.CallService)

const app = new Hono()

useTracing(app)
useLogger(app)
app.use(cors())
useOpenApi(app)
app.use(auth)
useExceptionHandler(app)


app.get('/ws', eventsWs)
app.route('/accounts', accountRoutes(accounts))
app.route('/contacts', contactRoutes(contacts))
app.route('/threads', threadRoutes(threads))
app.route('/threads', messageRoutes(messages))
app.route('/calls', callRoutes(calls))

const server = Bun.serve({ hostname: '127.0.0.1', port: config.port, fetch: app.fetch, websocket })

console.log('READY ' + JSON.stringify({ port: server.port, token: config.token }))

accounts.restore()

if (!process.stdin.isTTY) process.stdin.on('end', () => process.exit(0)).resume()
