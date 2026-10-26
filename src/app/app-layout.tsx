import { Outlet } from "react-router"
import { Rail } from "@/shared/components/layouts/sidebar/rail"
import { Toaster } from "@/shared/components/ui/sonner"

export const AppLayout = () => {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Rail />
      <Outlet />
      <Toaster />
    </div>
  )
}
