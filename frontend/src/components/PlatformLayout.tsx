import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function PlatformLayout() {
  const { platformAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-6">
            <NavLink to="/manager" className="text-xl font-bold text-white">
              glog <span className="text-violet-400">Manager</span>
            </NavLink>
            <nav className="flex gap-4 text-sm">
              <NavLink
                to="/manager"
                end
                className={({ isActive }) =>
                  isActive ? "text-violet-400" : "text-slate-400 hover:text-white"
                }
              >
                Manager 首頁
              </NavLink>
            </nav>
          </div>
          {platformAdmin && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">{platformAdmin.name}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                登出
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
