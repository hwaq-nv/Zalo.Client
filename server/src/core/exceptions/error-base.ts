import type { ContentfulStatusCode } from 'hono/utils/http-status'

export abstract class ErrorBase extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}
