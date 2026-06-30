import { NavLink, Outlet } from "react-router-dom";
import { ReminderBanner } from "./ReminderBanner";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "./TicketBadges";

const NAV_ITEMS: {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}[] = [
  { to: "/dashboard", label: "總覽" },
  { to: "/tickets", label: "工程工單" },
  { to: "/service-requests", label: "服務請求" },
  { to: "/logbook", label: "交班日誌" },
  { to: "/assets", label: "地點" },
  { to: "/inventory", label: "庫存" },
  { to: "/costs", label: "成本" },
  { to: "/users", label: "員工", adminOnly: true },
];

export function Layout() {
  const { profile, logout } = useAuth();
  const isAdmin = profile?.role === "ADMIN";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-6">
            <NavLink to="/dashboard" className="text-xl font-bold tracking-tight text-slate-900">
              glog
            </NavLink>
            <nav className="hidden gap-1 md:flex">
              {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm ${
                      isActive
                        ? "bg-indigo-50 font-medium text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {profile && (
            <div className="flex items-center gap-4">
              <div className="hidden text-right text-sm sm:block">
                <p className="font-medium text-slate-900">{profile.name}</p>
                <p className="text-slate-500">
                  {ROLE_LABELS[profile.role]} ·{" "}
                  {profile.status === "IDLE" ? "閒置" : "忙碌"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                登出
              </button>
            </div>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `shrink-0 rounded-lg px-3 py-1.5 text-xs ${
                  isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <ReminderBanner />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
