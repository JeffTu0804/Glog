import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { localDatetimeToIso } from "../lib/serviceRequest";
import type { Department } from "../types/api";

type EventKind = "TASK" | "MEMO";

const DEPT_OPTIONS: { id: Department; label: string }[] = [
  { id: "FRONT_DESK", label: "客務部" },
  { id: "HOUSEKEEPING", label: "房務部" },
  { id: "ENGINEERING", label: "工程部" },
  { id: "FOOD_BEVERAGE", label: "餐飲部" },
];

interface CreateEventModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateEventModal({
  open,
  onClose,
  onCreated,
}: CreateEventModalProps) {
  const { getToken } = useAuth();
  const [kind, setKind] = useState<EventKind>("TASK");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [guestRoom, setGuestRoom] = useState("");
  const [targetDepartment, setTargetDepartment] =
    useState<Department>("HOUSEKEEPING");
  const [enableExpires, setEnableExpires] = useState(false);
  const [expiresLocal, setExpiresLocal] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind("TASK");
    setTitle("");
    setContent("");
    setGuestRoom("");
    setTargetDepartment("HOUSEKEEPING");
    setEnableExpires(false);
    setExpiresLocal("");
    setError("");
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      if (kind === "MEMO") {
        await api.createNotice(token, {
          type: "MEMO",
          title: title.trim(),
          content: content.trim() || undefined,
          expiresAt:
            enableExpires && expiresLocal
              ? localDatetimeToIso(expiresLocal)
              : null,
        });
      } else {
        await api.createNotice(token, {
          type: "TASK",
          title: title.trim(),
          content: content.trim() || undefined,
          targetDepartment,
          guestRoom: guestRoom.trim() || undefined,
        });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="關閉"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">新增事件</h2>
            <p className="mt-1 text-sm text-slate-500">
              建立部門任務，或發佈館內知會照會
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glog-btn-ghost text-slate-400"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind("TASK")}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
              kind === "TASK"
                ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="block font-semibold text-slate-900">
              類型 A：任務
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              派工至部門 inbox
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKind("MEMO")}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
              kind === "MEMO"
                ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="block font-semibold text-slate-900">
              🟢 類型 B：純知會照會
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Memo · 可設時效
            </span>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">標題</span>
            <input
              required
              className="glog-input"
              placeholder={
                kind === "MEMO"
                  ? "例：大廳廁所暫停使用"
                  : "例：909 備品補送"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">說明</span>
            <textarea
              className="glog-input min-h-[80px]"
              placeholder="補充細節（選填）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>

          {kind === "TASK" && (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  目標部門
                </span>
                <select
                  className="glog-select w-full"
                  value={targetDepartment}
                  onChange={(e) =>
                    setTargetDepartment(e.target.value as Department)
                  }
                >
                  {DEPT_OPTIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  房號（選填）
                </span>
                <input
                  className="glog-input"
                  placeholder="例：909"
                  value={guestRoom}
                  onChange={(e) => setGuestRoom(e.target.value)}
                />
              </label>
            </>
          )}

          {kind === "MEMO" && (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={enableExpires}
                  onChange={(e) => setEnableExpires(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                設定預計結束/恢復時間（選填）
              </label>
              <p className="mt-1.5 text-xs text-slate-500">
                不設定則無限期有效，直到手動下架。
              </p>
              {enableExpires && (
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-slate-600">
                    預計結束時間
                  </span>
                  <input
                    type="datetime-local"
                    required={enableExpires}
                    className="glog-input"
                    value={expiresLocal}
                    onChange={(e) => setExpiresLocal(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="glog-btn-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="glog-btn-primary"
            >
              {submitting ? "送出中…" : "建立事件"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
