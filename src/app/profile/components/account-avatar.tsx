import type { ComponentProps } from "react"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import type { Account } from "@/shared/types"
import { ACCOUNT_STATUSES } from "@/app/profile/constants/account.constants"

export function AccountAvatar({ account, size = "lg" }: { account: Account; size?: ComponentProps<typeof Avatar>["size"] }) {
  return (
    <Avatar size={size}>
      {account.avatar && <AvatarImage src={account.avatar} />}
      <AvatarFallback>{account.name[0]}</AvatarFallback>
      {account.state === "active" && <AvatarBadge className={ACCOUNT_STATUSES[account.status].dot} />}
    </Avatar>
  )
}
