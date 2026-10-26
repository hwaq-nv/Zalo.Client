import { Hono } from 'hono'
import { z } from 'zod'
import { apiDocs, successResponse, validate } from '../../core'
import { AtRiskContactsRequest, ContactIdRequest, UpdateContactRequest } from './dtos/requests/contact.request'
import { AtRiskContact, Contact, ContactDetail } from './dtos/responses/contact.response'
import type IContactService from './services/interfaces/contact-service'

export const contactRoutes = (contacts: IContactService) =>
  new Hono()
    .get('/at-risk', apiDocs('contacts', z.array(AtRiskContact)), validate('query', AtRiskContactsRequest), (c) =>
      successResponse(c, contacts.atRisk(c.req.valid('query').minLinks)),
    )
    .get('/:id', apiDocs('contacts', ContactDetail), validate('param', ContactIdRequest), (c) => successResponse(c, contacts.get(c.req.valid('param').id)))
    .patch('/:id', apiDocs('contacts', Contact), validate('param', ContactIdRequest), validate('json', UpdateContactRequest), (c) =>
      successResponse(c, contacts.update(c.req.valid('param').id, c.req.valid('json'))),
    )
