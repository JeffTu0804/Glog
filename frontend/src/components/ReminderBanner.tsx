import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useActiveReminders } from "../hooks/useActiveReminders";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Department, Reminder } from "../types/api";

const PROCESSED_HOLD_MS = 6000;
const EXIT_ANIM_MS = 320;

type Phase = "idle" | "processed" | "exiting";

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

export function ReminderBanner() {
  const { getToken } = useAuth();
  const { reminders, reload } = useActiveReminders();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  /** 本地生命週期：processed → 停留 6s → exiting 動畫 → 從列表移除 */
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const visible = reminders.filter((r) => !hiddenIds.has(r.id));

  if (visible.length === 0 && !actionError) return null;

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
      // 即使 API 失敗也從畫面移除，避免卡住
    }
    setHiddenIds((prev) => new Set(prev).add(id));
    setPhases((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    clearTimers(id);
    await reload();
  }

  /** 點「已處理」：先標示已處理，6 秒後上滑淡出，再寫入歷史 */
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
    <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50">
      <div className="mx-auto max-h-[250px] max-w-6xl space-y-1.5 overflow-y-auto px-4 py-2.5">
        {actionError && (
          <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {actionError}
          </p>
        )}
        {visible.map((r) => {
          const phase = phases[r.id] ?? "idle";
          const isTicket = Boolean(r.maintenanceTicket);
          const isGuest = Boolean(r.guestRequest);
          const awaiting = isAwaitingAccept(r) && phase === "idle";
          const completed = isCompleted(r);
          const isRejected = r.serviceRequest?.status === "REJECTED";
          const isConfirmed = r.serviceRequest?.status === "CONFIRMED";
          const borderClass =
            phase === "processed" || phase === "exiting"
              ? "border-orange-300 bg-orange-50/80"
              : isRejected
                ? "border-red-200"
                : completed || isConfirmed
                  ? "border-emerald-200"
                  : isGuest && r.title.includes("逾時")
                    ? "border-red-200"
                    : "border-amber-200";

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
              className={`glog-card flex flex-wrap items-center justify-between gap-2 border px-3.5 py-2.5 transition-all duration-300 ease-out ${borderClass} ${
                phase === "exiting"
                  ? "pointer-events-none -translate-y-3 opacity-0"
                  : "translate-y-0 opacity-100"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">{r.title}</p>
                <p className="mt-0.5 text-sm text-amber-900/80">
                  {phase === "processed" || phase === "exiting"
                    ? "已標記處理，即將移入歷史紀錄…"
                    : displayMessage(r)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {phase === "idle" && (
                  <Link
                    to={detailPath}
                    className="glog-btn-secondary px-2.5 py-1 text-xs"
                  >
                    {isTicket ? "查看工單" : isGuest ? "客人請求" : "查看請求"}
                  </Link>
                )}
                {phase === "processed" || phase === "exiting" ? (
                  <span className="rounded-xl bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                    已處理
                  </span>
                ) : awaiting ? (
                  <button
                    type="button"
                    disabled={actingId === r.id}
                    onClick={() => void handleAccept(r)}
                    className="rounded-xl bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
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
                    className="rounded-xl bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                  >
                    已處理
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
