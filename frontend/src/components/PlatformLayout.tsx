import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: "/manager", label: "租戶總覽", end: true },
  { to: "/manager/inventory", label: "庫存" },
  { to: "/manager/costs", label: "成本" },
  { to: "/manager/users", label: "員工" },
];

const PAGE_LABELS: Record<string, string> = {
  "/manager": "租戶總覽",
  "/manager/inventory": "庫存",
  "/manager/costs": "成本",
  "/manager/users": "員工",
};

function UserAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
      {initial}
    </div>
  );
}

function PlatformBreadcrumb() {
  const { pathname } = useLocation();
  const isTenantDetail = pathname.startsWith("/manager/tenants/");
  const pageLabel = PAGE_LABELS[pathname];

  return (
    <nav className="text-sm text-slate-500">
      <NavLink to="/manager" className="hover:text-violet-600">
        首頁
      </NavLink>
      <span className="mx-2 text-slate-300">/</span>
      {isTenantDetail ? (
        <>
          <NavLink to="/manager" className="hover:text-violet-600">
            Manager 後台
          </NavLink>
          <span className="mx-2 text-slate-300">/</span>
          <span className="text-slate-700">租戶詳情</span>
        </>
      ) : pageLabel && pathname !== "/manager" ? (
        <>
          <NavLink to="/manager" className="hover:text-violet-600">
            Manager 後台
          </NavLink>
          <span className="mx-2 text-slate-300">/</span>
          <span className="text-slate-700">{pageLabel}</span>
        </>
      ) : (
        <span className="text-slate-700">Manager 後台</span>
      )}
    </nav>
  );
}

export function PlatformLayout() {
  const { platformAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-violet-50/80">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <NavLink to="/manager" className="text-xl font-bold text-slate-900">
              glog <span className="text-violet-600">Manager</span>
            </NavLink>
            <nav className="hidden gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm transition ${
                      isActive
                        ? "bg-violet-100 font-medium text-violet-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {platformAdmin && (
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-3 sm:flex">
                <UserAvatar name={platformAdmin.name} />
                <span className="text-sm font-medium text-slate-800">{platformAdmin.name}</span>
              </div>
              <button
                type="button"
                onClick={() => void logout("platform")}
                className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-600"
              >
                登出
              </button>
            </div>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-lg px-3 py-1.5 text-xs transition ${
                  isActive ? "bg-violet-100 text-violet-700" : "text-slate-600"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <PlatformBreadcrumb />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
