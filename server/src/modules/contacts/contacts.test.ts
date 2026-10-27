import type { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { FriendEventType, type FriendEvent, type User } from '@hwqnq/zca-js'
import { fakeZalo } from '../../../test/fake-zalo'
import { openDatabase } from '../../dbs/sqlite'
import { createContainer } from '../../di/dependency-injection'
import { TOKENS } from '../../di/tokens'
import { ZaloClient } from '../../third-party/zalo/zalo-client'
import type IAccountRepository from '../accounts/repositories/interfaces/account-repository'
import type IAccountService from '../accounts/services/interfaces/account-service'
import type IMessageService from '../messages/services/interfaces/message-service'
import type IThreadService from '../threads/services/interfaces/thread-service'
import type IContactService from './services/interfaces/contact-service'

const A = '1111111111111111111'
const B = '2222222222222222222'

function setup() {
  const db = openDatabase(':memory:')
  const c = createContainer(db)
  const zalo = c.get(ZaloClient)
  const repo = c.get<IAccountRepository>(TOKENS.AccountRepository)
  for (const id of [A, B]) repo.upsert(id, `Nick ${id.slice(0, 1)}`, '', { imei: id, userAgent: '', cookie: [] })
  // Như src/index.ts: mọi service phải được tạo để nghe event của ZaloClient
  const messages = c.get<IMessageService>(TOKENS.MessageService)
  return {
    db,
    zalo,
    messages,
    accounts: c.get<IAccountService>(TOKENS.AccountService),
    threads: c.get<IThreadService>(TOKENS.ThreadService),
    contacts: c.get<IContactService>(TOKENS.ContactService),
  }
}

const friend = (userId: string, displayName: string, extra: Partial<User> = {}): Partial<User> => ({
  userId,
  displayName,
  zaloName: displayName.toLowerCase(),
  avatar: `https://a/${userId}.jpg`,
  phoneNumber: '',
  ...extra,
})

const contactOf = (db: Database, account: string, uid: string) =>
  (db.query('SELECT contact_id FROM users WHERE account_id = ? AND id = ?').get(account, uid) as { contact_id: number | null } | null)?.contact_id ?? null

test('đồng bộ bạn bè: vào danh bạ của nick, mỗi người thành một contact, cùng uid ở hai nick là một người', async () => {
  const { db, threads, contacts } = setup()

  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan'), friend('u2', 'Minh')] }).api)
  await contacts.sync(B, fakeZalo(B, { friends: [friend('u1', 'Lan')] }).api)

  expect(threads.contacts(A).map((t) => [t.id, t.type, t.name, t.last_msg_at])).toEqual([
    ['u1', 0, 'Lan', null],
    ['u2', 0, 'Minh', null],
  ])
  const lan = contactOf(db, A, 'u1')!
  expect(contactOf(db, B, 'u1')).toBe(lan)
  expect(contactOf(db, A, 'u2')).not.toBe(lan)
  expect(contacts.get(lan).links.map((l) => [l.account_id, l.relation])).toEqual([
    [A, 'friend'],
    [B, 'friend'],
  ])
})

test('người lạ nhắn riêng cũng thành contact; người chỉ nói trong nhóm thì không', () => {
  const { db, zalo } = setup()
  const msg = (type: 0 | 1, threadId: string, uidFrom: string, msgId: string) =>
    zalo.emit('message', A, { type, threadId, isSelf: false, data: { msgId, cliMsgId: 'c', msgType: 'webchat', uidFrom, idTo: A, dName: 'Khách', ts: '1000', content: 'hi' } } as never)

  msg(0, 'stranger', 'stranger', '1')
  msg(1, 'g1', 'member', '2')

  expect(contactOf(db, A, 'stranger')).not.toBeNull()
  expect(contactOf(db, A, 'member')).toBeNull()
})

test('người lạ nhắn tới thì tự lấy tên và ảnh Zalo, gom thành một lần gọi; đã hỏi rồi thì không hỏi lại', async () => {
  const { zalo, threads, contacts } = setup()
  const z = fakeZalo(A, {
    friends: [friend('u1', 'Lan')],
    profiles: { s1: { displayName: 'Khách Mới', zaloName: 'khach moi', avatar: 'https://a/s1.jpg' } },
  })
  zalo.attach(A, z.api)
  await contacts.sync(A, z.api)
  expect(z.calls.miniProfiles).toEqual([])

  const msg = (uid: string, msgId: string) =>
    zalo.emit('message', A, { type: 0, threadId: uid, isSelf: false, data: { msgId, cliMsgId: 'c', msgType: 'webchat', uidFrom: uid, idTo: A, dName: 'Tên trong tin', ts: '1000', content: 'hi' } } as never)
  msg('s1', '1')
  msg('s2', '2')
  await Bun.sleep(700)

  expect(z.calls.miniProfiles).toEqual([['s1', 's2']])
  expect(threads.list(A).find((t) => t.id === 's1')).toMatchObject({ name: 'Khách Mới', avatar: 'https://a/s1.jpg' })
  expect(threads.list(A).find((t) => t.id === 's2')?.name).toBe('Tên trong tin')

  msg('s2', '3')
  await contacts.sync(A, z.api)
  await Bun.sleep(700)
  expect(z.calls.miniProfiles).toEqual([['s1', 's2']])
})

test('danh sách khách cần chú ý và hồ sơ có ảnh đại diện', async () => {
  const { db, contacts } = setup()

  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan')] }).api)

  const lan = contactOf(db, A, 'u1')!
  expect(contacts.atRisk(2)).toEqual([{ id: lan, name: 'Lan', phone: null, avatar: 'https://a/u1.jpg', live: 1, reach: 1 }])
  expect(contacts.get(lan).links.map((l) => l.avatar)).toEqual(['https://a/u1.jpg'])
})

test('người lạ đang nhắn với nick còn dùng là chưa kết bạn, không phải mất liên lạc', async () => {
  const { db, zalo, accounts, contacts } = setup()
  await contacts.sync(B, fakeZalo(B, { friends: [friend('u6', 'Hà')] }).api)
  accounts.setState(B, { state: 'locked' })
  zalo.emit('message', A, { type: 0, threadId: 's1', isSelf: false, data: { msgId: '1', cliMsgId: 'c', msgType: 'webchat', uidFrom: 's1', idTo: A, dName: 'Khách lạ', ts: '1000', content: 'hi' } } as never)

  expect(contacts.atRisk(2).map((r) => [r.name, r.live, r.reach])).toEqual([
    ['Hà', 0, 0],
    ['Khách lạ', 0, 1],
  ])
  expect(contactOf(db, A, 's1')).not.toBeNull()
})

test('hai nick thấy cùng một người với uid khác nhau thì gộp được nhờ trùng SĐT', async () => {
  const { db, contacts } = setup()

  await contacts.sync(A, fakeZalo(A, { friends: [friend('ua', 'Lan', { phoneNumber: '84912345678' })] }).api)
  await contacts.sync(B, fakeZalo(B, { friends: [friend('ub', 'Lan', { phoneNumber: '0912345678' })] }).api)

  expect(contactOf(db, B, 'ub')).toBe(contactOf(db, A, 'ua'))
})

test('version bạn bè không đổi thì không gọi lại Zalo; đổi version hoặc quá 24 giờ thì gọi lại', async () => {
  const { db, contacts } = setup()
  const z = fakeZalo(A, { friends: [friend('u1', 'Lan')] })

  await contacts.sync(A, z.api)
  await contacts.sync(A, z.api)
  expect(z.calls.getAllFriends).toBe(1)

  z.data.extraVer = { ...z.data.extraVer, friend: 'f2' }
  await contacts.sync(A, z.api)
  expect(z.calls.getAllFriends).toBe(2)

  db.run("UPDATE sync_state SET synced_at = 0 WHERE key = 'friends'")
  await contacts.sync(A, z.api)
  expect(z.calls.getAllFriends).toBe(3)
})

test('người không còn trong danh sách bạn thì về none nhưng vẫn giữ trong danh bạ và contact', async () => {
  const { db, contacts } = setup()
  const z = fakeZalo(A, { friends: [friend('u1', 'Lan'), friend('u2', 'Minh')] })
  await contacts.sync(A, z.api)
  const minh = contactOf(db, A, 'u2')!

  z.data.friends = [friend('u1', 'Lan')]
  z.data.extraVer = { ...z.data.extraVer, friend: 'f2' }
  await contacts.sync(A, z.api)

  expect(contacts.get(minh).links.map((l) => [l.account_id, l.relation])).toEqual([[A, 'none']])
})

test('nhóm: chỉ lấy info nhóm mới hoặc đổi version; nhóm đã rời thì không còn trong danh bạ', async () => {
  const { threads, contacts } = setup()
  const z = fakeZalo(A, {
    groups: { version: 'v1', gridVerMap: { g1: '1', g2: '1' } },
    groupInfo: { g1: { name: 'Nhóm 1', avt: 'a1' }, g2: { name: 'Nhóm 2', avt: 'a2' } },
  })
  await contacts.sync(A, z.api)

  z.data.groups = { version: 'v2', gridVerMap: { g1: '1', g3: '1' } }
  z.data.groupInfo.g3 = { name: 'Nhóm 3', avt: 'a3' }
  await contacts.sync(A, z.api)

  expect(z.calls.getGroupInfo).toEqual([['g1', 'g2'], ['g3']])
  expect(threads.contacts(A).map((t) => [t.id, t.type, t.name, t.avatar])).toEqual([
    ['g1', 1, 'Nhóm 1', 'a1'],
    ['g3', 1, 'Nhóm 3', 'a3'],
  ])
})

test('thành viên nhóm được lưu tên và ảnh từ getGroupInfo, không cần gọi miniProfiles', async () => {
  const { db, contacts } = setup()
  const z = fakeZalo(A, {
    groups: { version: 'v1', gridVerMap: { g1: '1' } },
    groupInfo: {
      g1: {
        name: 'Nhóm 1',
        avt: 'a1',
        currentMems: [{ id: 'm1', dName: 'Thành viên 1', zaloName: 'tv1', avatar: 'https://a/m1.jpg' }],
      },
    },
  })
  await contacts.sync(A, z.api)

  const row = db.query('SELECT display_name, zalo_name, avatar, synced_at FROM users WHERE account_id = ? AND id = ?').get(A, 'm1') as any
  expect(row).toMatchObject({ display_name: 'Thành viên 1', zalo_name: 'tv1', avatar: 'https://a/m1.jpg' })
  expect(row.synced_at).not.toBeNull()
  expect(z.calls.miniProfiles).toEqual([])
})

test('tên gợi nhớ được đồng bộ và hiện thay tên Zalo; lời mời đã gửi thành quan hệ sent', async () => {
  const { db, threads, contacts } = setup()
  const aliases = Array.from({ length: 150 }, (_, i) => ({ userId: `x${i}`, alias: `X ${i}` }))
  const z = fakeZalo(A, {
    friends: [friend('u1', 'Lan')],
    aliases: [...aliases, { userId: 'u1', alias: 'Chị Lan Q7' }],
    sent: { u5: { userId: 'u5' } },
  })

  await contacts.sync(A, z.api)

  expect(threads.contacts(A).find((t) => t.id === 'u1')?.name).toBe('Chị Lan Q7')
  expect(contacts.get(contactOf(db, A, 'u5')!).links.map((l) => [l.account_id, l.relation])).toEqual([[A, 'sent']])
})

test('SĐT Zalo trả về được lưu vào contact, kể cả dạng 0xxx', async () => {
  const { db, contacts } = setup()

  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan', { phoneNumber: '0987654321' })] }).api)

  expect(contacts.get(contactOf(db, A, 'u1')!).phone).toBe('84987654321')
})

test('khách cần dự phòng: đếm số nick đang dùng còn là bạn; khoá nick thì số này giảm', async () => {
  const { accounts, contacts } = setup()
  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan'), friend('u2', 'Minh')] }).api)
  await contacts.sync(B, fakeZalo(B, { friends: [friend('u1', 'Lan')] }).api)

  expect(contacts.atRisk(2).map((r) => [r.name, r.live])).toEqual([['Minh', 1]])

  accounts.setState(A, { state: 'locked' })
  expect(contacts.atRisk(2).map((r) => [r.name, r.live])).toEqual([
    ['Minh', 0],
    ['Lan', 1],
  ])
  expect(contacts.atRisk(1).map((r) => [r.name, r.live])).toEqual([['Minh', 0]])
})

test('xoá vĩnh viễn một nick thì contact vẫn còn, chỉ mất liên kết với nick đó', async () => {
  const { db, accounts, contacts } = setup()
  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan', { phoneNumber: '84912345678' })] }).api)
  await contacts.sync(B, fakeZalo(B, { friends: [friend('u1', 'Lan')] }).api)
  const lan = contactOf(db, A, 'u1')!

  accounts.remove(A)

  expect(contacts.get(lan)).toMatchObject({ phone: '84912345678', zalo_uid: 'u1' })
  expect(contacts.get(lan).links.map((l) => l.account_id)).toEqual([B])
})

test('friend_event cập nhật quan hệ: lời mời tới, kết bạn, huỷ kết bạn, chặn', () => {
  const { db, zalo, contacts } = setup()
  const event = (e: Omit<FriendEvent, 'isSelf'> & { isSelf?: boolean }) => zalo.emit('friend_event', A, { isSelf: false, ...e } as FriendEvent)
  const relation = () => contacts.get(contactOf(db, A, 'u9')!).links[0].relation

  event({ type: FriendEventType.REQUEST, data: { fromUid: 'u9', toUid: A, src: 1, message: 'chào shop' }, threadId: A })
  expect(relation()).toBe('received')
  event({ type: FriendEventType.ADD, data: 'u9', threadId: 'u9' })
  expect(relation()).toBe('friend')
  event({ type: FriendEventType.REMOVE, data: 'u9', threadId: 'u9' })
  expect(relation()).toBe('none')
  event({ type: FriendEventType.REQUEST, data: { fromUid: A, toUid: 'u9', src: 1, message: '' }, threadId: 'u9', isSelf: true })
  expect(relation()).toBe('sent')
  event({ type: FriendEventType.UNDO_REQUEST, data: { fromUid: A, toUid: 'u9' }, threadId: 'u9', isSelf: true })
  expect(relation()).toBe('none')
  event({ type: FriendEventType.BLOCK, data: 'u9', threadId: 'u9', isSelf: true })
  expect(relation()).toBe('blocked')
})

test('sửa contact: SĐT được chuẩn hoá; SĐT đã thuộc người khác thì báo trùng; SĐT sai thì báo lỗi', async () => {
  const { db, contacts } = setup()
  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan'), friend('u2', 'Minh')] }).api)
  const lan = contactOf(db, A, 'u1')!
  const minh = contactOf(db, A, 'u2')!

  expect(contacts.update(lan, { name: 'Chị Lan', phone: '0912 345 678', note: 'VIP' })).toMatchObject({ name: 'Chị Lan', phone: '84912345678', note: 'VIP' })
  expect(() => contacts.update(minh, { phone: '+84 912 345 678' })).toThrow('phone already belongs to another contact')
  expect(() => contacts.update(minh, { phone: '12' })).toThrow('invalid phone')
  expect(contacts.update(lan, { phone: null })).toMatchObject({ phone: null })
  expect(() => contacts.update(9999, { note: 'x' })).toThrow('contact not found')
})

test('tên trong hộp thư ưu tiên tên tự đặt cho contact, rồi mới tới tên gợi nhớ và tên Zalo', async () => {
  const { db, zalo, threads, contacts } = setup()
  const z = fakeZalo(A, { friends: [friend('u1', 'Lan')] })
  await contacts.sync(A, z.api)
  zalo.emit('message', A, { type: 0, threadId: 'u1', isSelf: false, data: { msgId: '1', cliMsgId: 'c', msgType: 'webchat', uidFrom: 'u1', idTo: A, dName: 'Lan', ts: '1000', content: 'chào' } } as never)
  const name = () => threads.list(A).find((t) => t.id === 'u1')?.name

  expect(name()).toBe('Lan')
  z.data.aliases = [{ userId: 'u1', alias: 'Chị Lan Q7' }]
  z.data.extraVer = { ...z.data.extraVer, alias: 'a2' }
  await contacts.sync(A, z.api)
  expect(name()).toBe('Chị Lan Q7')
  contacts.update(contactOf(db, A, 'u1')!, { name: 'Lan (khách VIP)' })
  expect(name()).toBe('Lan (khách VIP)')
})

test('msg_id so theo số: 1000 mới hơn 999 dù cùng ts; msgId không phải số thì bỏ qua', () => {
  const { zalo, threads, messages } = setup()
  const msg = (msgId: string) =>
    zalo.emit('message', A, { type: 0, threadId: 'u1', isSelf: false, data: { msgId, cliMsgId: '55', msgType: 'webchat', uidFrom: 'u1', idTo: A, dName: 'Lan', ts: '1000', content: msgId } } as never)
  msg('1000')
  msg('999')
  msg('abc')

  expect(messages.list(A, 'u1', { limit: 50 }).map((m) => [m.msg_id, m.cli_msg_id])).toEqual([
    ['1000', '55'],
    ['999', '55'],
  ])
  expect(threads.list(A)[0].preview).toBe('1000')
})

test('nhóm lưu mô tả, người tạo và thành viên kèm vai trò', async () => {
  const { db, contacts } = setup()
  const z = fakeZalo(A, {
    groups: { version: 'v1', gridVerMap: { g1: '1' } },
    groupInfo: { g1: { name: 'Nhóm 1', desc: 'mô tả', creatorId: 'u1', adminIds: ['u2'], memberIds: ['u1', 'u2', 'u3'], totalMember: 3 } },
  })
  await contacts.sync(A, z.api)

  expect(db.query('SELECT description, creator_id, total_member FROM groups WHERE id = ?').get('g1')).toEqual({ description: 'mô tả', creator_id: 'u1', total_member: 3 })
  expect(db.query('SELECT user_id, role FROM group_members WHERE group_id = ? ORDER BY user_id').all('g1')).toEqual([
    { user_id: 'u1', role: 'owner' },
    { user_id: 'u2', role: 'admin' },
    { user_id: 'u3', role: 'member' },
  ])
})

test('tìm theo SĐT của bạn đã đồng bộ thì trả luôn, không cần nick online', async () => {
  const { threads, contacts } = setup()
  await contacts.sync(A, fakeZalo(A, { friends: [friend('u1', 'Lan', { phoneNumber: '0912345678' })] }).api)

  expect(await threads.findByPhone({ accountId: A, phone: '0912 345 678' })).toMatchObject({ id: 'u1', name: 'Lan' })
})
