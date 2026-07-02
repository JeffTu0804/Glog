import { Link } from "react-router-dom";
import { useActiveReminders } from "../hooks/useActiveReminders";

export function ReminderBanner() {
  const { reminders, dismiss } = useActiveReminders();

  if (reminders.length === 0) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
        {reminders.map((r) => {
          const isTicket = Boolean(r.maintenanceTicket);
          const isGuest = Boolean(r.guestRequest);
          const isRejected = r.serviceRequest?.status === "REJECTED";
          const isConfirmed = r.serviceRequest?.status === "CONFIRMED";
          const borderClass = isRejected
            ? "border-red-300"
            : isConfirmed
              ? "border-emerald-300"
              : isGuest && r.title.includes("逾時")
                ? "border-red-300"
                : "border-amber-200";

          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-white p-3 ${borderClass}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-900">{r.title}</p>
                <p className="mt-1 text-sm text-amber-800">{r.message}</p>
                {r.serviceRequest && (
                  <p className="mt-1 text-xs text-amber-600">
                    {r.serviceRequest.guestRoom} 號房 {r.serviceRequest.guestName} ·
                    預約 {new Date(r.serviceRequest.scheduledAt).toLocaleString("zh-TW")}
                    {r.serviceRequest.responseNote && (
                      <> · 回覆：{r.serviceRequest.responseNote}</>
                    )}
                  </p>
                )}
                {r.maintenanceTicket && (
                  <p className="mt-1 text-xs text-amber-600">
                    {r.maintenanceTicket.asset.code} 號房 · {r.maintenanceTicket.title}
                  </p>
                )}
                {r.guestRequest && (
                  <p className="mt-1 text-xs text-amber-600">
                    {r.guestRequest.roomNumber} 號房 · {r.guestRequest.hotelName}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {isTicket ? (
                  <Link
                    to={`/tickets/${r.maintenanceTicket!.id}`}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
                  >
                    查看工單
                  </Link>
                ) : isGuest ? (
                  <Link
                    to="/guest-requests"
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
                  >
                    住客請求
                  </Link>
                ) : (
                  <Link
                    to="/service-requests"
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
                  >
                    查看請求
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void dismiss(r.id)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
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
