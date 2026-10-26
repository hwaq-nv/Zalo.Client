import type { CallMessage, GroupCallMembers } from '../../../../types'
import type { CallAction, StartCallRequest } from '../../dtos/requests/call.request'

export default interface ICallService {
  // Trạng thái các cuộc đang có, gửi cho client vừa nối WS /calls
  snapshot(): CallMessage[]
  // Mỗi lúc một cuộc trên mọi nick (micro, loa dùng chung). Diễn biến về qua WS /calls
  start(accountId: string, body: StartCallRequest): void
  groupMembers(accountId: string, groupId: string): Promise<GroupCallMembers>
  action(a: CallAction): void
}
