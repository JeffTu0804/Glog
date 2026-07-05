import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertBanner } from "../components/ui/AlertBanner";
import { EmptyState } from "../components/ui/EmptyState";
import { FilterChip } from "../components/ui/FilterChip";
import { PageHeader } from "../components/ui/PageHeader";
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
      <PageHeader
        title="客人請求"
        subtitle="房客掃碼提交的服務請求，依部門自動派單 · 30 分鐘未結案會提醒"
        accent="sky"
        action={
          <div className="flex gap-2">
            {isAdmin && (
              <Link to="/qr-rooms" className="glog-btn-secondary">
                QR 管理
              </Link>
            )}
            <FilterChip
              label={view === "inbox" ? "顯示全部" : "只看收件匣"}
              active={view === "all"}
              onClick={() => setView(view === "inbox" ? "all" : "inbox")}
            />
          </div>
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : requests.length === 0 ? (
        <EmptyState message="目前沒有待處理的住客請求" />
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => (
            <li key={req.id} className="glog-card p-5">
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
                      className="glog-btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      開始處理
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={submitting === req.id}
                    onClick={() => void handleStatus(req.id, "completed")}
                    className="rounded-xl bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
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
                    className="glog-input min-w-[200px] flex-1 py-1.5"
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
