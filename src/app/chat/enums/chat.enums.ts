export const MessageType = {
  Sticker: "chat.sticker",
  Photo: "chat.photo",
  Gif: "chat.gif",
  Voice: "chat.voice",
  Video: "chat.video.msg",
  Location: "chat.location.new",
  File: "share.file",
  Recommended: "chat.recommended",
} as const

export type MessageType = (typeof MessageType)[keyof typeof MessageType]

// "recommened" là chính tả của Zalo, đừng sửa
export const RecommendedAction = {
  CallTime: "recommened.calltime",
  MissedCall: "recommened.misscall",
} as const

export type RecommendedAction = (typeof RecommendedAction)[keyof typeof RecommendedAction]
