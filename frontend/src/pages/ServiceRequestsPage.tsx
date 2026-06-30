import { type FormEvent, useEffect, useState } from "react";
import { ROLE_LABELS } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import {
  DEPARTMENT_LABELS,
  REQUEST_STATUS_LABELS,
  defaultTomorrowNoonLocal,
  localDatetimeToIso,
  reminderBeforeScheduled,
} from "../lib/serviceRequest";
import type { ServiceRequest, UserRole } from "../types/api";

const CREATE_ROLES: UserRole[] = ["ADMIN", "FRONT_DESK", "HOUSEKEEPING"];
const HANDLE_ROLES: UserRole[] = ["ADMIN", "FOOD_BEVERAGE"];

type View = "inbox" | "sent" | "all";

export function ServiceRequestsPage() {
  const { profile, getToken } = useAuth();
  const [view, setView] = useState<View>("inbox");
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");

  // 建立表單
  const [guestRoom, setGuestRoom] = useState("305");
  const [guestName, setGuestName] = useState("");
  const [title, setTitle] = useState("中餐廳預約");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultTomorrowNoonLocal);
  const [reminderAt, setReminderAt] = useState(
    reminderBeforeScheduled(defaultTomorrowNoonLocal()),
  );
  const [submitting, setSubmitting] = useState(false);

  const canCreate = profile && CREATE_ROLES.includes(profile.role);
  const canHandle = profile && HANDLE_ROLES.includes(profile.role);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { requests: list } = await api.getServiceRequests(token, view);
      setRequests(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [view, getToken]);

  function handleScheduledChange(value: string) {
    setScheduledAt(value);
    setReminderAt(reminderBeforeScheduled(value));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.createServiceRequest(token, {
        type: "RESTAURANT_RESERVATION",
        title,
        description: description || undefined,
        guestRoom,
        guestName,
        targetDepartment: "FOOD_BEVERAGE",
        scheduledAt: localDatetimeToIso(scheduledAt),
        reminderAt: reminderAt ? localDatetimeToIso(reminderAt) : undefined,
      });
      setShowCreate(false);
      setView("sent");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(id: string) {
    if (!responseNote.trim()) {
      setError("請填寫確認回覆");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      await api.confirmServiceRequest(token, id, responseNote);
      setHandlingId(null);
      setResponseNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "確認失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(id: string) {
    if (!responseNote.trim()) {
      setError("請填寫拒絕原因");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      await api.rejectServiceRequest(token, id, responseNote);
      setHandlingId(null);
      setResponseNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">跨部門服務請求</h1>
          <p className="mt-1 text-sm text-slate-500">
            前台建立預約 → 餐飲部確認 → 自動提醒通知客人
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + 建立服務請求
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { v: "inbox" as const, label: canHandle ? "部門收件匣" : "待處理" },
            { v: "sent" as const, label: "我送出的" },
            { v: "all" as const, label: "全部" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.v}
            type="button"
            onClick={() => setView(tab.v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              view === tab.v
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
          尚無服務請求
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <article
              key={req.id}
              className={`rounded-xl bg-white p-5 shadow-sm ring-1 ${
                req.status === "PENDING" && view === "inbox"
                  ? "ring-amber-300"
                  : "ring-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">{req.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {req.guestRoom} 號房 · {req.guestName}
                  </p>
                  {req.description && (
                    <p className="mt-1 text-sm text-slate-500">{req.description}</p>
                  )}
                </div>
                <StatusBadge status={req.status} />
              </div>

              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">預約時間</dt>
                  <dd className="font-medium text-slate-900">
                    {new Date(req.scheduledAt).toLocaleString("zh-TW")}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">通知客人時間</dt>
                  <dd className="font-medium text-slate-900">
                    {req.reminderAt
                      ? new Date(req.reminderAt).toLocaleString("zh-TW")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">送至部門</dt>
                  <dd>{DEPARTMENT_LABELS[req.targetDepartment]}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">建立人</dt>
                  <dd>
                    {req.createdBy.name}（{ROLE_LABELS[req.createdBy.role] ?? req.createdBy.role}）
                  </dd>
                </div>
              </dl>

              {req.responseNote && (
                <div
                  className={`mt-4 rounded-lg p-3 text-sm ${
                    req.status === "CONFIRMED"
                      ? "bg-emerald-50 text-emerald-900"
                      : "bg-red-50 text-red-900"
                  }`}
                >
                  <p className="font-medium">
                    {req.status === "CONFIRMED" ? "餐飲部確認" : "餐飲部回覆"}
                    {req.handledBy ? ` · ${req.handledBy.name}` : ""}
                  </p>
                  <p className="mt-1">{req.responseNote}</p>
                  {req.status === "CONFIRMED" && (
                    <p className="mt-2 text-xs font-medium text-emerald-800">
                      請儘快通知客人預約已確認（頂部橫幅也會提醒）
                    </p>
                  )}
                  {req.status === "REJECTED" && (
                    <p className="mt-2 text-xs font-medium text-red-800">
                      請儘快通知客人預約無法受理
                    </p>
                  )}
                  {req.status === "CONFIRMED" && req.reminders.length > 0 && (
                    <p className="mt-2 text-xs opacity-80">
                      已排程提醒：{new Date(req.reminders[0].remindAt).toLocaleString("zh-TW")} 通知前台聯繫客人
                    </p>
                  )}
                </div>
              )}

              {req.status === "PENDING" && canHandle && view === "inbox" && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {handlingId === req.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={responseNote}
                        onChange={(e) => setResponseNote(e.target.value)}
                        rows={2}
                        placeholder="例：已預約明天 12:00 中餐廳 2 位，桌號 A3"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleConfirm(req.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        >
                          確認預約
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleReject(req.id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        >
                          無法受理
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHandlingId(null);
                            setResponseNote("");
                          }}
                          className="text-sm text-slate-500"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setHandlingId(req.id)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                    >
                      處理此請求
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">建立服務請求</h2>
            <p className="mt-1 text-sm text-slate-500">將傳送至餐飲部處理</p>

            <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-4">
              <Field label="房號" value={guestRoom} onChange={setGuestRoom} required />
              <Field label="客人姓名" value={guestName} onChange={setGuestName} required placeholder="例：林先生" />
              <Field label="請求標題" value={title} onChange={setTitle} required />
              <div>
                <label className="mb-1 block text-sm font-medium">說明</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="例：希望靠窗座位"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">預約時間</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => handleScheduledChange(e.target.value)}
                  required
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">提醒前台通知客人</label>
                <input
                  type="datetime-local"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">預設為預約前 30 分鐘（例：12:00 預約 → 11:30 提醒）</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {submitting ? "送出中…" : "送至餐飲部"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ServiceRequest["status"] }) {
  const colors = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-slate-100 text-slate-600",
    COMPLETED: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}>
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
    </div>
  );
}
