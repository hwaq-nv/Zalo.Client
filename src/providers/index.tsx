import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/shared/components/ui/tooltip"
import { queryClient } from "@/core/http/query-client"

export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}
