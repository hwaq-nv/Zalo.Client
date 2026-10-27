import type { MessageRow, Receipt, Sticker, SyncState } from '../../../../types'
import type {
  ListMessagesRequest,
  ReactRequest,
  SearchMessagesRequest,
  SearchStickersRequest,
  SendMessageRequest,
  SendStickerRequest,
} from '../../dtos/requests/message.request'

export type Upload = { name: string; data: Buffer; width?: number; height?: number }

export default interface IMessageService {
  list(accountId: string, threadId: string, query: ListMessagesRequest): MessageRow[]
  // Tìm không dấu, "d" khớp cả "đ"; bỏ accountId = mọi acc. Tin đã thu hồi không ra
  search(query: SearchMessagesRequest): MessageRow[]
  // Tin vừa gửi về lại qua listener (selfListen) → WS 'message' như mọi tin khác. quoteMsgId = trả lời tin đó.
  // Zalo Web chỉ trích được vào tin chữ: có tệp thì chữ (mang phần trích) đi trước, tệp đi sau; 1 ảnh + chữ thì chữ thành chú thích
  send(accountId: string, threadId: string, body: SendMessageRequest, files?: Upload[]): Promise<void>
  // Zalo Web không trích được vào sticker: đang trả lời thì sticker vẫn gửi thường
  sendSticker(accountId: string, threadId: string, body: SendStickerRequest): Promise<void>
  recentStickers(limit?: number): Sticker[]
  // Qua mạng nên cần nick đang online
  searchStickers(query: SearchStickersRequest): Promise<Sticker[]>
  // icon '' = gỡ hết cảm xúc của mình trên tin. Kết quả về qua listener → WS 'reaction'
  react(accountId: string, threadId: string, msgId: string, body: ReactRequest): Promise<void>
  // Thu hồi tin của mình; kết quả đi qua WS 'undo'
  recall(accountId: string, threadId: string, msgId: string): Promise<void>
  // Mốc đã nhận / đã xem của từng người trong hội thoại; đổi thì WS 'receipt'
  receipts(accountId: string, threadId: string): Receipt[]
  // Điện thoại xác nhận rồi gửi bản sao lưu về; các bước tiếp theo đi qua WS 'sync_status'
  requestSync(accountId: string): Promise<SyncState>
  cancelSync(accountId: string): Promise<void>
  syncState(accountId: string): SyncState
}
