import type { ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar"
import { Button } from "@/shared/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog"
import { Skeleton } from "@/shared/components/ui/skeleton"
import { useLoginQr, useStartLoginQr } from "@/app/profile/hooks/useAccounts"

export const LoginQrDialog = ({ children }: { children: ReactNode }) => {
  const { data: qr } = useLoginQr()
  const start = useStartLoginQr()

  function body() {
    if (start.error) return <p className="text-destructive">{start.error.message}</p>
    switch (qr?.type) {
      case "qr":
        return <img src={qr.image} alt="Mã QR đăng nhập" className="size-full rounded-lg bg-white" />
      case "qr-scanned":
        return (
          <>
            <Avatar className="size-20">
              <AvatarImage src={qr.avatar} />
              <AvatarFallback>{qr.name[0]}</AvatarFallback>
            </Avatar>
            <p className="font-medium">{qr.name}</p>
            <p className="text-muted-foreground">Xác nhận đăng nhập trên điện thoại</p>
          </>
        )
      case "qr-failed":
        return (
          <>
            <p className="text-muted-foreground">Mã đã hết hạn hoặc bị từ chối</p>
            <Button onClick={() => start.mutate()}>Tạo mã mới</Button>
          </>
        )
      case "qr-done":
        return (
          <>
            <p className="font-medium">Đăng nhập thành công</p>
            <DialogClose asChild>
              <Button>Xong</Button>
            </DialogClose>
          </>
        )
      default:
        return <Skeleton className="size-full" />
    }
  }

  return (
    <Dialog onOpenChange={(open) => open && start.mutate()}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm tài khoản</DialogTitle>
          <DialogDescription>Mở Zalo trên điện thoại và quét mã bằng mục Quét mã QR</DialogDescription>
        </DialogHeader>
        <div className="mx-auto flex size-64 flex-col items-center justify-center gap-3 text-center">{body()}</div>
      </DialogContent>
    </Dialog>
  )
}
