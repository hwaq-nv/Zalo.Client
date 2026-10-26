import { Hono } from 'hono'
import { z } from 'zod'
import { docs, ok, validate } from '../../core'
import { AtRiskContactsRequest, ContactIdRequest, UpdateContactRequest } from './dtos/requests/contact.request'
import { AtRiskContact, Contact, ContactDetail } from './dtos/responses/contact.response'
import type IContactService from './services/interfaces/contact-service'

export const contactRoutes = (contacts: IContactService) =>
  new Hono()
    .get('/at-risk', docs('contacts', z.array(AtRiskContact)), validate('query', AtRiskContactsRequest), (c) =>
      ok(c, contacts.atRisk(c.req.valid('query').minLinks)),
    )
    .get('/:id', docs('contacts', ContactDetail), validate('param', ContactIdRequest), (c) => ok(c, contacts.get(c.req.valid('param').id)))
    .patch('/:id', docs('contacts', Contact), validate('param', ContactIdRequest), validate('json', UpdateContactRequest), (c) =>
      ok(c, contacts.update(c.req.valid('param').id, c.req.valid('json'))),
    )
