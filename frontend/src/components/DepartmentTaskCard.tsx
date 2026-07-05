import { ROLE_LABELS } from "./TicketBadges";
import { uploadUrl } from "../lib/photoUpload";
import { DEPARTMENT_LABELS, REQUEST_STATUS_LABELS } from "../lib/serviceRequest";
import type { ServiceRequest } from "../types/api";

type TaskView = "inbox" | "active" | "sent" | "all";

export function DepartmentTaskCard({
  req,
  view,
  profileId,
  canHandle,
  handlingId,
  submitting,
  completeNote,
  onSetHandlingId,
  onCompleteNoteChange,
  onCompletePhotosChange,
  onAccept,
  onComplete,
}: {
  req: ServiceRequest;
  view: TaskView;
  profileId?: string;
  canHandle: boolean;
  handlingId: string | null;
  submitting: boolean;
  completeNote: string;
  onSetHandlingId: (id: string | null) => void;
  onCompleteNoteChange: (v: string) => void;
  onCompletePhotosChange: (files: FileList | null) => void;
  onAccept: () => void;
  onComplete: () => void;
}) {
  const isMine = req.handledBy?.id === profileId;
  const statusColors = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-indigo-100 text-indigo-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-slate-100 text-slate-600",
    COMPLETED: "bg-emerald-100 text-emerald-800",
  };

  return (
    <article
      className={`glog-card p-5 ${
        req.status === "PENDING" && view === "inbox"
          ? "ring-2 ring-amber-200"
          : req.status === "CONFIRMED" && view === "active"
            ? "ring-2 ring-blue-200"
            : ""
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
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status]}`}
        >
          {REQUEST_STATUS_LABELS[req.status]}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">建立時間</dt>
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
          <dt className="text-slate-500">通報人</dt>
          <dd>
            {req.createdBy.name}（{ROLE_LABELS[req.createdBy.role] ?? req.createdBy.role}）
          </dd>
        </div>
        {req.handledBy && (
          <div>
            <dt className="text-slate-500">接單人</dt>
            <dd>{req.handledBy.name}</dd>
          </div>
        )}
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

      {req.responseNote && req.status === "COMPLETED" && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">
            完成回報{req.handledBy ? ` · ${req.handledBy.name}` : ""}
          </p>
          <p className="mt-1">{req.responseNote}</p>
        </div>
      )}

      {req.status === "PENDING" && canHandle && view === "inbox" && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onAccept}
            className="glog-btn-primary disabled:opacity-50"
          >
            接單
          </button>
          <p className="mt-2 text-xs text-slate-500">
            接單後請至「進行中」上傳照片結案（{DEPARTMENT_LABELS[req.targetDepartment]}）
          </p>
        </div>
      )}

      {req.status === "CONFIRMED" && isMine && canHandle && view === "active" && (
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
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              上傳照片並結案
            </button>
          )}
        </div>
      )}
    </article>
  );
}
