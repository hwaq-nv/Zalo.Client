export const NalType = {
  Sps: 7,
  Pps: 8,
  Aud: 9,
} as const

export type NalType = (typeof NalType)[keyof typeof NalType]

export const CallType = {
  Voice: 0,
  Video: 1,
} as const

export type CallType = (typeof CallType)[keyof typeof CallType]

export const CallMemberState = {
  Calling: "calling",
  Ringing: "ringing",
  InCall: "incall",
  Left: "left",
} as const

export type CallMemberState = (typeof CallMemberState)[keyof typeof CallMemberState]
