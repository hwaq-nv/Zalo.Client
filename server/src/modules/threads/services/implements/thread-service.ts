import { inject, injectable } from 'inversify'
import { NotFoundError } from '../../../../core'
import { TOKENS } from '../../../../di/tokens'
import type IThreadRepository from '../../repositories/interfaces/thread-repository'
import type IThreadService from '../interfaces/thread-service'

@injectable()
export default class ThreadService implements IThreadService {
  constructor(@inject(TOKENS.ThreadRepository) private threads: IThreadRepository) {}

  list(accountId?: string) {
    return this.threads.list(accountId)
  }

  contacts(accountId: string) {
    return this.threads.contacts(accountId)
  }

  markRead(accountId: string, id: string) {
    if (!this.threads.markRead(accountId, id)) throw new NotFoundError('thread not found')
  }
}
