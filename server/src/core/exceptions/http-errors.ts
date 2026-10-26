import { ErrorBase } from './error-base'

export class BadRequestError extends ErrorBase {
  constructor(message = 'bad request', code = 'BAD_REQUEST') {
    super(400, message, code)
  }
}

export class UnauthorizedError extends ErrorBase {
  constructor(message = 'unauthorized', code = 'UNAUTHORIZED') {
    super(401, message, code)
  }
}

export class NotFoundError extends ErrorBase {
  constructor(message = 'not found', code = 'NOT_FOUND') {
    super(404, message, code)
  }
}

export class ConflictError extends ErrorBase {
  constructor(message = 'conflict', code = 'CONFLICT') {
    super(409, message, code)
  }
}
