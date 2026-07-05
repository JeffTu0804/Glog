import { type FormEvent, useEffect, useState } from "react";
import { ROLE_LABELS } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { filesToPhotoPayload, uploadUrl } from "../lib/photoUpload";
import {
  DEPARTMENT_LABELS,
  REQUEST_STATUS_LABELS,
  RESTAURANT_STATUS_LABELS,
  defaultTomorrowNoonLocal,
  isDepartmentTask,
  isRestaurantRequest,
  localDatetimeToIso,
  reminderBeforeScheduled,
} from "../lib/serviceRequest";
import type { ServiceRequest, UserRole } from "../types/api";

const CREATE_ROLES: UserRole[] = ["ADMIN", "FRONT_DESK", "HOUSEKEEPING"];
const RESTAURANT_HANDLE_ROLES: UserRole[] = ["ADMIN", "FOOD_BEVERAGE"];
const DEPARTMENT_HANDLE_ROLES: UserRole[] = [
  "ADMIN",
  "HOUSEKEEPING",
  "FRONT_DESK",
  "ENGINEER",
];

type View = "inbox" | "active" | "sent" | "all";

export function ServiceRequestsPage() {
  const { profile, getToken } = useAuth();
  const [view, setView] = useState<View>("inbox");
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [completePhotos, setCompletePhotos] = useState<FileList | null>(null);

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
  const canHandleRestaurant =
    profile && RESTAURANT_HANDLE_ROLES.includes(profile.role);
  const canHandleDepartment =
    profile && DEPARTMENT_HANDLE_ROLES.includes(profile.role);

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

  async function handleAccept(id: string) {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.acceptServiceRequest(token, id);
      setView("active");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "接單失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: string) {
    if (!completePhotos?.length) {
      setError("請上傳完成照片");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      const photos = await filesToPhotoPayload(completePhotos);
      await api.completeServiceRequest(token, id, {
        note: completeNote.trim() || "已完成",
        photo: photos[0]!,
      });
      setHandlingId(null);
      setCompleteNote("");
      setCompletePhotos(null);
      setView("inbox");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "結案失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(id: string) {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.confirmServiceRequest(token, id, responseNote.trim() || undefined);
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
      setError("請填寫無法受理原因（例：人數已額滿、預約時段非營業時間）");
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

  const tabs: { v: View; label: string }[] = [
    { v: "inbox", label: "待接單" },
    ...(canHandleDepartment ? [{ v: "active" as const, label: "進行中" }] : []),
    { v: "sent", label: "我送出的" },
    { v: "all", label: "全部" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">服務請求</h1>
          <p className="mt-1 text-sm text-slate-500">
            部門任務接單 · 餐廳預約確認 · 完成後上傳照片通知前台
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + 建立餐廳預約
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
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
          {view === "inbox"
            ? "目前沒有待接單任務"
            : view === "active"
              ? "沒有進行中的任務"
              : "尚無服務請求"}
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              view={view}
              profileId={profile?.id}
              canHandleRestaurant={!!canHandleRestaurant}
              canHandleDepartment={!!canHandleDepartment}
              handlingId={handlingId}
              submitting={submitting}
              responseNote={responseNote}
              completeNote={completeNote}
              onSetHandlingId={setHandlingId}
              onResponseNoteChange={setResponseNote}
              onCompleteNoteChange={setCompleteNote}
              onCompletePhotosChange={setCompletePhotos}
              onAccept={() => void handleAccept(req.id)}
              onComplete={() => void handleComplete(req.id)}
              onConfirm={() => void handleConfirm(req.id)}
              onReject={() => void handleReject(req.id)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">建立餐廳預約</h2>
            <p className="mt-1 text-sm text-slate-500">將傳送至餐飲部處理</p>

            <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-4">
              <Field label="房號" value={guestRoom} onChange={setGuestRoom} required />
              <Field
                label="客人姓名"
                value={guestName}
                onChange={setGuestName}
                required
                placeholder="例：林先生"
              />
              <Field label="請求標題" value={title} onChange={setTitle} required />
              <div>
                <label className="mb-1 block text-sm font-medium">說明</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
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

function RequestCard({
  req,
  view,
  profileId,
  canHandleRestaurant,
  canHandleDepartment,
  handlingId,
  submitting,
  responseNote,
  completeNote,
  onSetHandlingId,
  onResponseNoteChange,
  onCompleteNoteChange,
  onCompletePhotosChange,
  onAccept,
  onComplete,
  onConfirm,
  onReject,
}: {
  req: ServiceRequest;
  view: View;
  profileId?: string;
  canHandleRestaurant: boolean;
  canHandleDepartment: boolean;
  handlingId: string | null;
  submitting: boolean;
  responseNote: string;
  completeNote: string;
  onSetHandlingId: (id: string | null) => void;
  onResponseNoteChange: (v: string) => void;
  onCompleteNoteChange: (v: string) => void;
  onCompletePhotosChange: (files: FileList | null) => void;
  onAccept: () => void;
  onComplete: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const restaurant = isRestaurantRequest(req);
  const deptTask = isDepartmentTask(req);
  const statusLabels = restaurant ? RESTAURANT_STATUS_LABELS : REQUEST_STATUS_LABELS;
  const isMine = req.handledBy?.id === profileId;

  return (
    <article
      className={`rounded-xl bg-white p-5 shadow-sm ring-1 ${
        req.status === "PENDING" && view === "inbox"
          ? "ring-amber-300"
          : req.status === "CONFIRMED" && view === "active"
            ? "ring-indigo-300"
            : "ring-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{req.title}</h2>
            {req.source === "line" && (
              <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                LINE
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {req.guestRoom} 號房 · {req.guestName}
          </p>
          {req.description && (
            <p className="mt-1 text-sm text-slate-500">{req.description}</p>
          )}
        </div>
        <StatusBadge status={req.status} labels={statusLabels} />
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{restaurant ? "預約時間" : "建立時間"}</dt>
          <dd className="font-medium text-slate-900">
            {new Date(req.scheduledAt).toLocaleString("zh-TW")}
          </dd>
        </div>
        {req.acceptedAt && (
          <div>
            <dt className="text-slate-500">接單時間</dt>
            <dd className="font-medium text-slate-900">
              {new Date(req.acceptedAt).toLocaleString("zh-TW")}
            </dd>
          </div>
        )}
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

      {req.completionPhotoUrl && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">完成照片</p>
          <img
            src={uploadUrl(req.completionPhotoUrl)}
            alt="完成照片"
            className="max-h-48 rounded-lg border object-cover"
          />
        </div>
      )}

      {req.responseNote && req.status !== "PENDING" && (
        <div
          className={`mt-4 rounded-lg p-3 text-sm ${
            req.status === "COMPLETED" || req.status === "CONFIRMED"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-red-50 text-red-900"
          }`}
        >
          <p className="font-medium">
            {req.status === "COMPLETED" ? "完成回報" : "部門回覆"}
            {req.handledBy ? ` · ${req.handledBy.name}` : ""}
          </p>
          <p className="mt-1">{req.responseNote}</p>
        </div>
      )}

      {deptTask && req.status === "PENDING" && canHandleDepartment && view === "inbox" && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onAccept}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            接單
          </button>
          <p className="mt-2 text-xs text-slate-500">接單後請至「進行中」上傳照片結案</p>
        </div>
      )}

      {deptTask &&
        req.status === "CONFIRMED" &&
        isMine &&
        canHandleDepartment &&
        view === "active" && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {handlingId === req.id ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">完成照片（必填）</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => onCompletePhotosChange(e.target.files)}
                    className="w-full text-sm"
                  />
                </div>
                <textarea
                  value={completeNote}
                  onChange={(e) => onCompleteNoteChange(e.target.value)}
                  rows={2}
                  placeholder="例：已補上枕頭"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onComplete}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    完成並通知前台
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetHandlingId(null);
                      onCompleteNoteChange("");
                      onCompletePhotosChange(null);
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
                onClick={() => onSetHandlingId(req.id)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                上傳照片並結案
              </button>
            )}
          </div>
        )}

      {restaurant &&
        req.status === "PENDING" &&
        canHandleRestaurant &&
        view === "inbox" && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {handlingId === req.id ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  補充事項
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    確認預約選填；無法受理時請填寫原因
                  </span>
                </label>
                <textarea
                  value={responseNote}
                  onChange={(e) => onResponseNoteChange(e.target.value)}
                  rows={2}
                  placeholder="例：桌號 A3、需兒童椅；或拒絕原因：人數已額滿、預約時段非營業時間"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onConfirm}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    確認預約
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onReject}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    無法受理
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetHandlingId(null);
                      onResponseNoteChange("");
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
                onClick={() => onSetHandlingId(req.id)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                處理此預約
              </button>
            )}
          </div>
        )}
    </article>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  status: ServiceRequest["status"];
  labels: typeof REQUEST_STATUS_LABELS | typeof RESTAURANT_STATUS_LABELS;
}) {
  const colors = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-indigo-100 text-indigo-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-slate-100 text-slate-600",
    COMPLETED: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}>
      {labels[status]}
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
