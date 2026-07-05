import { Link } from "react-router-dom";
import { useActiveReminders } from "../hooks/useActiveReminders";
import type { Department } from "../types/api";

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

export function ReminderBanner() {
  const { reminders, dismiss } = useActiveReminders();

  if (reminders.length === 0) return null;

  return (
    <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
        {reminders.map((r) => {
          const isTicket = Boolean(r.maintenanceTicket);
          const isGuest = Boolean(r.guestRequest);
          const isRejected = r.serviceRequest?.status === "REJECTED";
          const isConfirmed = r.serviceRequest?.status === "CONFIRMED";
          const borderClass = isRejected
            ? "border-red-200"
            : isConfirmed
              ? "border-emerald-200"
              : isGuest && r.title.includes("逾時")
                ? "border-red-200"
                : "border-amber-200";

          return (
            <div
              key={r.id}
              className={`glog-card flex flex-wrap items-start justify-between gap-3 border p-4 ${borderClass}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-950">{r.title}</p>
                <p className="mt-1 text-sm text-amber-900/80">{r.message}</p>
                {r.serviceRequest && (
                  <p className="mt-1 text-xs text-amber-700/70">
                    {r.serviceRequest.guestRoom} 號房 {r.serviceRequest.guestName} ·
                    預約 {new Date(r.serviceRequest.scheduledAt).toLocaleString("zh-TW")}
                    {r.serviceRequest.responseNote && (
                      <> · 回覆：{r.serviceRequest.responseNote}</>
                    )}
                  </p>
                )}
                {r.maintenanceTicket && (
                  <p className="mt-1 text-xs text-amber-700/70">
                    {r.maintenanceTicket.asset.code} 號房 · {r.maintenanceTicket.title}
                  </p>
                )}
                {r.guestRequest && (
                  <p className="mt-1 text-xs text-amber-700/70">
                    {r.guestRequest.roomNumber} 號房 · {r.guestRequest.hotelName}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {isTicket ? (
                  <Link
                    to={`/tickets/${r.maintenanceTicket!.id}`}
                    className="glog-btn-secondary px-3 py-1.5 text-xs"
                  >
                    查看工單
                  </Link>
                ) : isGuest ? (
                  <Link
                    to="/guest-requests"
                    className="glog-btn-secondary px-3 py-1.5 text-xs"
                  >
                    客人請求
                  </Link>
                ) : (
                  <Link
                    to={serviceRequestPath(
                      r.serviceRequest?.targetDepartment ?? r.notifyDepartment,
                    )}
                    className="glog-btn-secondary px-3 py-1.5 text-xs"
                  >
                    查看請求
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void dismiss(r.id)}
                  className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
                >
                  已處理
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
