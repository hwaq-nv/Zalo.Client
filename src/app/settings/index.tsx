import { NavLink, Outlet } from "react-router"
import { buttonVariants } from "@/shared/components/ui/button"
import { cn } from "@/shared/utils/shadcn"
import { SETTINGS_SECTIONS } from "@/app/settings/constants/settings.constants"

export const SettingsScreen = () => {
  return (
    <div className="flex min-w-0 flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b md:w-72 md:border-r md:border-b-0 lg:w-80">
        <p className="p-3 font-medium">Cài đặt</p>
        <nav className="flex gap-1 overflow-x-auto px-3 max-md:pb-3 md:flex-col">
          {SETTINGS_SECTIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "justify-start")}
            >
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
