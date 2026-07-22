import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { UserAvatar } from "./ui/UserAvatar";

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin", label: "總覽", end: true },
  { to: "/admin/analytics", label: "營運報表" },
  { to: "/admin/inventory", label: "庫存" },
  { to: "/admin/costs", label: "成本" },
  { to: "/admin/users", label: "員工" },
];

const PAGE_LABELS: Record<string, string> = {
  "/admin": "總覽",
  "/admin/analytics": "營運報表",
  "/admin/inventory": "庫存",
  "/admin/costs": "成本",
  "/admin/users": "員工",
};

function AdminBreadcrumb() {
  const { pathname } = useLocation();
  const pageLabel = PAGE_LABELS[pathname];

  return (
    <nav className="text-sm text-slate-500">
      <NavLink to="/admin" className="font-medium hover:text-violet-600">
        首頁
      </NavLink>
      <span className="mx-2 text-slate-300">/</span>
      {pageLabel && pathname !== "/admin" ? (
        <>
          <NavLink to="/admin" className="hover:text-violet-600">
            飯店 Admin
          </NavLink>
          <span className="mx-2 text-slate-300">/</span>
          <span className="font-medium text-slate-700">{pageLabel}</span>
        </>
      ) : (
        <span className="font-medium text-slate-700">飯店 Admin</span>
      )}
    </nav>
  );
}

export function AdminLayout() {
  const { profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-glog-bg)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-5">
            <NavLink to="/admin" className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-sm font-bold text-white shadow-sm">
                A
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900">
                glog <span className="text-violet-600">Admin</span>
              </span>
            </NavLink>
            <nav className="hidden gap-0.5 lg:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? "glog-nav-link-active-manager" : "glog-nav-link-manager"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {profile && (
            <div className="flex items-center gap-3">
              <div className="hidden min-w-0 items-center gap-3 sm:flex">
                <UserAvatar name={profile.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{profile.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {profile.tenantName ?? "飯店"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void logout("hotel")}
                className="glog-btn-ghost text-slate-500"
              >
                登出
              </button>
            </div>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium ${
                  isActive ? "bg-violet-50 text-violet-700" : "text-slate-600"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mx-auto max-w-6xl px-4 pb-3">
          <AdminBreadcrumb />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
