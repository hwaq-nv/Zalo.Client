import type { API } from '@hwqnq/zca-js'
import type { AtRiskContact, Contact, ContactDetail } from '../../../../types'
import type { UpdateContactRequest } from '../../dtos/requests/contact.request'

export default interface IContactService {
  // Đồng bộ danh bạ của nick theo version rồi gắn contact; tự chạy mỗi lần nick đăng nhập (event 'attached')
  sync(accountId: string, api: API): Promise<void>
  // Lấy tên, ảnh cho người mới biết qua tin nhắn; gom các lần gọi sát nhau thành một
  scheduleProfileRefresh(accountId: string): void
  // Người có ít hơn minLinks nick đang dùng còn là bạn: 0 = cần kết bạn lại, 1 = nên có nick dự phòng
  atRisk(minLinks: number): AtRiskContact[]
  get(id: number): ContactDetail
  update(id: number, body: UpdateContactRequest): Contact
}
