import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CreateEventModal } from "./CreateEventModal";
import { ReminderBanner } from "./ReminderBanner";
import { UserAvatar } from "./ui/UserAvatar";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "./TicketBadges";

const NAV_ITEMS = [
  { to: "/home", label: "首頁" },
  { to: "/front-office", label: "客務部" },
  { to: "/engineering", label: "工程部" },
  { to: "/food-beverage", label: "餐飲部" },
  { to: "/guest-requests", label: "客人請求" },
  { to: "/housekeeping", label: "房務部" },
  { to: "/logbook", label: "交班紀錄" },
  { to: "/ticket-history", label: "工單歷史紀錄" },
];

export function Layout() {
  const { profile, logout } = useAuth();
  const homePath = "/home";
  const [eventOpen, setEventOpen] = useState(false);
  const [eventTick, setEventTick] = useState(0);

  return (
    <div className="min-h-screen bg-[var(--color-glog-bg)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-5">
            <NavLink to={homePath} className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-sm font-bold text-white shadow-sm">
                g
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900">
                glog
              </span>
            </NavLink>
            <nav className="hidden gap-0.5 lg:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "glog-nav-link-active" : "glog-nav-link"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setEventOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
            >
              <span aria-hidden className="text-base leading-none">
                ＋
              </span>
              <span className="hidden sm:inline">新增事件</span>
            </button>
            {profile && (
              <>
                <div className="hidden items-center gap-3 sm:flex">
                  <UserAvatar name={profile.name} />
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {profile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABELS[profile.role]} ·{" "}
                      {profile.status === "IDLE" ? "閒置" : "忙碌"}
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
              </>
            )}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-slate-600"
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
        <Outlet context={{ eventTick }} />
      </main>

      <CreateEventModal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        onCreated={() => setEventTick((n) => n + 1)}
      />
    </div>
  );
}
