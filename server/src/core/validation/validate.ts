import type { ValidationTargets } from 'hono'
import { resolver, uniqueSymbol } from 'hono-openapi'
import { validator } from 'hono/validator'
import type { z } from 'zod'

export const validate = <T extends keyof ValidationTargets, S extends z.ZodType>(target: T, schema: S) =>
  Object.assign(validator(target, (value): z.output<S> => schema.parse(value)), { [uniqueSymbol]: { target, ...resolver(schema) } })
