import { createHashRouter, Navigate, Outlet } from "react-router"
import { RouterProvider } from "react-router/dom"
import { Providers } from "@/providers"
import { Rail } from "@/shared/components/layouts/sidebar/rail"
import { Toaster } from "@/shared/components/ui/sonner"
import { ChatScreen } from "@/app/chat"
import { SettingsScreen } from "@/app/settings"
import { SECTIONS } from "@/app/settings/constants/settings.constants"

function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Rail />
      <Outlet />
      <Toaster />
    </div>
  )
}

const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <ChatScreen /> },
      {
        path: "settings",
        element: <SettingsScreen />,
        children: [
          { index: true, element: <Navigate to={SECTIONS[0].to} replace /> },
          ...SECTIONS.map(({ to, Component }) => ({ path: to, Component })),
        ],
      },
    ],
  },
])

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
