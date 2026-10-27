import { EventEmitter } from 'node:events'
import type { API, User } from '@hwqnq/zca-js'

export type FakeZaloData = {
  friends?: Partial<User>[]
  aliases?: { userId: string; alias: string }[]
  sent?: Record<string, unknown>
  groups?: { version: string; gridVerMap: Record<string, string> }
  groupInfo?: Record<
    string,
    {
      name?: string
      avt?: string
      fullAvt?: string
      desc?: string
      creatorId?: string
      adminIds?: string[]
      memberIds?: string[]
      totalMember?: number
      currentMems?: { id: string; dName?: string; zaloName?: string; avatar?: string; avatar_25?: string }[]
    }
  >
  profiles?: Record<string, { displayName?: string; zaloName?: string; avatar?: string }>
  extraVer?: { friend?: string; alias?: string }
}

export function fakeZalo(accountId: string, initial: FakeZaloData = {}) {
  const data: Required<FakeZaloData> = {
    friends: initial.friends ?? [],
    aliases: initial.aliases ?? [],
    sent: initial.sent ?? {},
    groups: initial.groups ?? { version: '', gridVerMap: {} },
    groupInfo: initial.groupInfo ?? {},
    profiles: initial.profiles ?? {},
    extraVer: initial.extraVer ?? { friend: 'f1', alias: 'a1' },
  }

  const calls = {
    getAllFriends: 0,
    getGroupInfo: [] as string[][],
    miniProfiles: [] as string[][],
    getUserInfo: [] as string[][],
  }

  const listener = new EventEmitter() as any
  listener.start = () => {}
  listener.stop = () => {}

  const customs = new Map<string, Function>()

  const api = {
    listener,
    getContext: () => ({ extraVer: data.extraVer, imei: accountId, userAgent: 'test' }),
    getCookie: () => ({ toJSON: () => ({ cookies: [] }) }),
    getAllFriends: async () => {
      calls.getAllFriends++
      return data.friends
    },
    getAliasList: async (count: number, page: number) => {
      const start = (page - 1) * count
      return { items: data.aliases.slice(start, start + count) }
    },
    getSentFriendRequest: async () => data.sent,
    getAllGroups: async () => data.groups,
    getGroupInfo: async (ids: string[]) => {
      calls.getGroupInfo.push(ids)
      const gridInfoMap: Record<string, any> = {}
      for (const id of ids) {
        gridInfoMap[id] = data.groupInfo[id] ?? { name: id, avt: null }
      }
      return { gridInfoMap }
    },
    getUserInfo: async (ids: string[]) => {
      calls.getUserInfo.push(ids)
      const changed_profiles: Record<string, any> = {}
      for (const id of ids) {
        if (data.profiles[id]) changed_profiles[id] = { userId: id, ...data.profiles[id] }
      }
      return { changed_profiles, unchanged_profiles: {} }
    },
    custom: (name: string, fn: Function) => {
      customs.set(name, fn)
    },
    getminiprofiles: async ({ friend_ids }: { friend_ids: string[] }) => {
      calls.miniProfiles.push(friend_ids)
      const result: Record<string, any> = {}
      for (const id of friend_ids) {
        if (data.profiles[id]) {
          result[id] = { userId: id, ...data.profiles[id] }
        }
      }
      return result
    },
  } as unknown as API & { getminiprofiles: any }

  return { api, data, calls }
}
