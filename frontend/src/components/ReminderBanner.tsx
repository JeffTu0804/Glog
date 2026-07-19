import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useActiveReminders } from "../hooks/useActiveReminders";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Department, Reminder } from "../types/api";

const PROCESSED_HOLD_MS = 6000;
const EXIT_ANIM_MS = 320;

type Phase = "idle" | "processed" | "exiting";

type NotificationContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  count: number;
  reminders: Reminder[];
  reload: () => Promise<void>;
  markLocalDismissed: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

function useNotificationCenter() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("NotificationCenter 必須包在 NotificationProvider 內");
  }
  return ctx;
}

function serviceRequestPath(department?: Department): string {
  switch (department) {
    case "FOOD_BEVERAGE":
      return "/food-beverage";
    case "HOUSEKEEPING":
      return "/housekeeping";
    case "ENGINEERING":
      return "/engineering";
    case "FRONT_DESK":
    case "MANAGEMENT":
      return "/guest-requests";
    default:
      return "/guest-requests";
  }
}

function isAwaitingAccept(r: Reminder): boolean {
  if (r.serviceRequest) return r.serviceRequest.status === "PENDING";
  if (r.maintenanceTicket) return r.maintenanceTicket.status === "OPEN";
  if (r.guestRequest) return r.guestRequest.status === "pending";
  return false;
}

function isCompleted(r: Reminder): boolean {
  if (r.serviceRequest) return r.serviceRequest.status === "COMPLETED";
  if (r.maintenanceTicket) {
    return (
      r.maintenanceTicket.status === "COMPLETED" ||
      r.maintenanceTicket.status === "CLOSED"
    );
  }
  if (r.guestRequest) return r.guestRequest.status === "completed";
  return false;
}

function displayMessage(r: Reminder): string {
  if (r.serviceRequest) {
    const sr = r.serviceRequest;
    const roomTitle = `${sr.guestRoom}號房 ${sr.title}`;
    if (sr.status === "COMPLETED") {
      return `${roomTitle} 已由 ${sr.handledBy?.name ?? "同事"} 完成`;
    }
    if (sr.status === "CONFIRMED") {
      const who = sr.handledBy?.name;
      return who ? `${roomTitle} 處理中（${who}）` : `${roomTitle} 處理中`;
    }
    if (sr.status === "PENDING") {
      return `${sr.guestRoom} 號房「${sr.title}」尚無人接單`;
    }
  }

  if (r.maintenanceTicket) {
    const mt = r.maintenanceTicket;
    const roomTitle = `${mt.asset.code}號房 ${mt.title}`;
    if (mt.status === "COMPLETED" || mt.status === "CLOSED") {
      return `${roomTitle} 已由 ${mt.assignedTo?.name ?? "工程師"} 完成`;
    }
    if (mt.status === "OPEN") {
      return `${mt.asset.code} 號房「${mt.title}」尚無人接單`;
    }
    const who = mt.assignedTo?.name;
    return who ? `${roomTitle} 處理中（${who}）` : `${roomTitle} 處理中`;
  }

  if (r.guestRequest) {
    const gr = r.guestRequest;
    const roomTitle = `${gr.roomNumber}號房 ${gr.requestType}`;
    if (gr.status === "completed") {
      return `${roomTitle} 已由 ${gr.handledBy?.name ?? "同事"} 完成`;
    }
    if (gr.status === "pending") {
      return `${gr.roomNumber} 號房「${gr.requestType}」尚無人接單`;
    }
    const who = gr.handledBy?.name;
    return who ? `${roomTitle} 處理中（${who}）` : `${roomTitle} 處理中`;
  }

  return r.message;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { reminders, reload } = useActiveReminders();
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(0);

  const visibleReminders = useMemo(
    () => reminders.filter((r) => !dismissedIds.has(r.id)),
    [reminders, dismissedIds],
  );
  const count = visibleReminders.length;

  useEffect(() => {
    if (count > prevCountRef.current && count > 0) {
      setOpen(true);
    }
    prevCountRef.current = count;
  }, [count]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const markLocalDismissed = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      open,
      setOpen,
      toggle,
      count,
      reminders: visibleReminders,
      reload,
      markLocalDismissed,
    }),
    [open, toggle, count, visibleReminders, reload, markLocalDismissed],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/** Navbar 右上角通知鈴鐺 */
export function NotificationBell() {
  const { open, toggle, count } = useNotificationCenter();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={count > 0 ? `通知（${count}）` : "通知"}
      aria-expanded={open}
      title="即時通知"
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
        open
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/** 右上角懸浮 Toast 面板（由鈴鐺開關） */
export function ReminderBanner() {
  const { getToken } = useAuth();
  const { open, setOpen, reminders, reload, markLocalDismissed } =
    useNotificationCenter();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  if (!open) return null;

  function clearTimers(id: string) {
    const hold = timersRef.current.get(`${id}-hold`);
    const exit = timersRef.current.get(`${id}-exit`);
    if (hold) clearTimeout(hold);
    if (exit) clearTimeout(exit);
    timersRef.current.delete(`${id}-hold`);
    timersRef.current.delete(`${id}-exit`);
  }

  async function finalizeDismiss(id: string) {
    try {
      const token = await getToken();
      await api.dismissReminder(token, id);
    } catch {
      // ignore
    }
    markLocalDismissed(id);
    setPhases((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    clearTimers(id);
    await reload();
  }

  function beginExitThenDismiss(id: string) {
    clearTimers(id);
    setPhases((prev) => ({ ...prev, [id]: "exiting" }));
    const exitTimer = setTimeout(() => {
      void finalizeDismiss(id);
    }, EXIT_ANIM_MS);
    timersRef.current.set(`${id}-exit`, exitTimer);
  }

  function beginProcessedLifecycle(id: string) {
    clearTimers(id);
    setPhases((prev) => ({ ...prev, [id]: "processed" }));

    const holdTimer = setTimeout(() => {
      setPhases((prev) => ({ ...prev, [id]: "exiting" }));
      const exitTimer = setTimeout(() => {
        void finalizeDismiss(id);
      }, EXIT_ANIM_MS);
      timersRef.current.set(`${id}-exit`, exitTimer);
    }, PROCESSED_HOLD_MS);

    timersRef.current.set(`${id}-hold`, holdTimer);
  }

  async function handleAccept(r: Reminder) {
    setActingId(r.id);
    setActionError("");
    try {
      const token = await getToken();
      if (r.serviceRequest?.status === "PENDING") {
        await api.acceptServiceRequest(token, r.serviceRequest.id);
      } else if (r.maintenanceTicket?.status === "OPEN") {
        await api.acceptMaintenanceTicket(token, r.maintenanceTicket.id);
      } else if (r.guestRequest?.status === "pending") {
        await api.updateGuestRequest(token, r.guestRequest.id, {
          status: "processing",
        });
        beginProcessedLifecycle(r.id);
        return;
      }
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "接單失敗");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div
      className="pointer-events-none fixed top-20 right-4 z-50 flex max-h-[calc(100vh-6rem)] w-full max-w-sm flex-col gap-2.5 overflow-y-auto"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
        <p className="text-xs font-semibold text-slate-700">
          即時通知
          {reminders.length > 0 ? `（${reminders.length}）` : ""}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          收合
        </button>
      </div>

      {actionError && (
        <div className="pointer-events-auto relative rounded-xl border border-red-200 bg-white/95 px-3 py-2.5 text-xs text-red-700 shadow-xl backdrop-blur">
          <button
            type="button"
            aria-label="關閉錯誤"
            onClick={() => setActionError("")}
            className="absolute top-1.5 right-1.5 rounded-md p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
          >
            <span className="block text-sm leading-none">×</span>
          </button>
          <p className="pr-6">{actionError}</p>
        </div>
      )}

      {reminders.length === 0 && !actionError && (
        <div className="pointer-events-auto rounded-xl border border-slate-200/80 bg-white/95 px-4 py-6 text-center text-sm text-slate-500 shadow-xl backdrop-blur">
          目前沒有待處理通知
        </div>
      )}

      {reminders.map((r) => {
        const phase = phases[r.id] ?? "idle";
        const isTicket = Boolean(r.maintenanceTicket);
        const isGuest = Boolean(r.guestRequest);
        const awaiting = isAwaitingAccept(r) && phase === "idle";
        const completed = isCompleted(r);
        const isRejected = r.serviceRequest?.status === "REJECTED";
        const isConfirmed = r.serviceRequest?.status === "CONFIRMED";
        const accentBorder =
          phase === "processed" || phase === "exiting"
            ? "border-orange-200"
            : isRejected
              ? "border-red-200"
              : completed || isConfirmed
                ? "border-emerald-200"
                : isGuest && r.title.includes("逾時")
                  ? "border-red-200"
                  : "border-slate-200/80";

        const detailPath = isTicket
          ? `/tickets/${r.maintenanceTicket!.id}`
          : isGuest
            ? "/guest-requests"
            : serviceRequestPath(
                r.serviceRequest?.targetDepartment ?? r.notifyDepartment,
              );

        return (
          <div
            key={r.id}
            className={`pointer-events-auto relative w-full rounded-xl border bg-white/95 p-3.5 shadow-xl backdrop-blur transition-all duration-300 ease-out ${accentBorder} ${
              phase === "exiting"
                ? "pointer-events-none translate-x-3 opacity-0"
                : "translate-x-0 opacity-100"
            }`}
          >
            <button
              type="button"
              aria-label="關閉通知"
              onClick={() => beginExitThenDismiss(r.id)}
              className="absolute top-2 right-2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <span className="block text-sm leading-none">×</span>
            </button>

            <div className="pr-6">
              <p className="text-sm font-semibold text-slate-900">{r.title}</p>
              <p className="mt-1 text-sm leading-snug text-slate-600">
                {phase === "processed" || phase === "exiting"
                  ? "已標記處理，即將移入歷史紀錄…"
                  : displayMessage(r)}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {phase === "idle" && (
                <Link
                  to={detailPath}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {isTicket ? "查看工單" : isGuest ? "客人請求" : "查看請求"}
                </Link>
              )}
              {phase === "processed" || phase === "exiting" ? (
                <span className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                  已處理
                </span>
              ) : awaiting ? (
                <button
                  type="button"
                  disabled={actingId === r.id}
                  onClick={() => void handleAccept(r)}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {actingId === r.id
                    ? "接單中…"
                    : isGuest
                      ? "指派處理"
                      : "點擊接單"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actingId === r.id}
                  onClick={() => beginProcessedLifecycle(r.id)}
                  className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-slate-900 disabled:opacity-50"
                >
                  已處理
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
