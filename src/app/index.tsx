import { createHashRouter, Navigate } from "react-router"
import { RouterProvider } from "react-router/dom"
import { Providers } from "@/providers"
import { AppLayout } from "@/app/app-layout"
import { ChatScreen } from "@/app/chat"
import { SettingsScreen } from "@/app/settings"
import { SETTINGS_SECTIONS } from "@/app/settings/constants/settings.constants"

const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <ChatScreen /> },
      {
        path: "settings",
        element: <SettingsScreen />,
        children: [
          { index: true, element: <Navigate to={SETTINGS_SECTIONS[0].to} replace /> },
          ...SETTINGS_SECTIONS.map(({ to, Component }) => ({ path: to, Component })),
        ],
      },
    ],
  },
])

export const App = () => {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
