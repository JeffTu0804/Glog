import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { DEPARTMENT_LABELS, GUEST_STATUS_LABELS } from "../lib/guestApi";
import type { GuestRequestItem } from "../types/api";

export function GuestRequestsPage() {
  const { getToken, profile } = useAuth();
  const [requests, setRequests] = useState<GuestRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [view, setView] = useState<"inbox" | "all">("inbox");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const isAdmin = profile?.role === "ADMIN";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { requests: list } = await api.getGuestRequests(token, { view });
      setRequests(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [getToken, view]);

  async function handleStatus(id: string, status: "processing" | "completed") {
    setSubmitting(id);
    setError("");
    try {
      const token = await getToken();
      await api.updateGuestRequest(token, id, {
        status,
        notes: notes[id]?.trim() || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">住客請求收件匣</h1>
          <p className="mt-1 text-sm text-slate-500">
            房客掃碼提交的服務請求，依部門自動派單 · 30 分鐘未結案會提醒
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Link
              to="/qr-rooms"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              QR 管理
            </Link>
          )}
          <button
            type="button"
            onClick={() => setView(view === "inbox" ? "all" : "inbox")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {view === "inbox" ? "顯示全部" : "只看收件匣"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : requests.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
          目前沒有待處理的住客請求
        </p>
      ) : (
        <ul className="space-y-4">
          {requests.map((req) => (
            <li
              key={req.id}
              className="rounded-xl bg-white p-5 ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {req.room_number} 號房 · {req.request_label}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {req.hotel_name} · {DEPARTMENT_LABELS[req.target_department]} ·{" "}
                    {new Date(req.created_at).toLocaleString("zh-TW")}
                  </p>
                  {req.notes && (
                    <p className="mt-2 text-sm text-slate-600">備註：{req.notes}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    req.status === "completed"
                      ? "bg-emerald-100 text-emerald-800"
                      : req.status === "processing"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {GUEST_STATUS_LABELS[req.status] ?? req.status}
                </span>
              </div>

              {req.status !== "completed" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {req.status === "pending" && (
                    <button
                      type="button"
                      disabled={submitting === req.id}
                      onClick={() => void handleStatus(req.id, "processing")}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      開始處理
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={submitting === req.id}
                    onClick={() => void handleStatus(req.id, "completed")}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    標記完成
                  </button>
                  <input
                    type="text"
                    placeholder="處理備註（選填）"
                    value={notes[req.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              )}

              {req.handled_by && (
                <p className="mt-2 text-xs text-slate-400">
                  處理人：{req.handled_by.name}
                  {req.completed_at &&
                    ` · ${new Date(req.completed_at).toLocaleString("zh-TW")}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
