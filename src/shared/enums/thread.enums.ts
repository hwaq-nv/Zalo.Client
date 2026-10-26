export const ThreadType = {
  User: 0,
  Group: 1,
} as const

export type ThreadType = (typeof ThreadType)[keyof typeof ThreadType]
