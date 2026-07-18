import { useState } from "react";
import { AlertBanner } from "../components/ui/AlertBanner";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import {
  useCrossDeptTickets,
  type CrossDeptDepartment,
  type CrossDeptTicketStatus,
} from "../hooks/useCrossDeptTickets";
import { api } from "../lib/api";

const DEPT_LABELS: Record<string, string> = {
  front_desk: "前台",
  housekeeping: "房務",
  engineering: "工程",
  purchasing: "採購",
  spa: "SPA",
};

const STATUS_LABELS: Record<CrossDeptTicketStatus, string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
  delayed: "已延遲",
};

const STATUS_CLASS: Record<CrossDeptTicketStatus, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  processing: "bg-sky-50 text-sky-800 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  delayed: "bg-rose-50 text-rose-800 ring-rose-200",
};

const DEPARTMENTS: CrossDeptDepartment[] = [
  "front_desk",
  "housekeeping",
  "engineering",
  "purchasing",
  "spa",
];

export function CrossDeptTicketsPage() {
  const { getToken } = useAuth();
  const { tickets, hotelId, loading, error, refresh } = useCrossDeptTickets();
  const [toDepartment, setToDepartment] =
    useState<CrossDeptDepartment>("purchasing");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!description.trim()) {
      setFormError("請填寫任務說明");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      await api.createCrossDeptTicket(token, {
        toDepartment,
        description: description.trim(),
      });
      setDescription("");
      // Realtime INSERT 會自動補上；保險再 refresh
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="跨部門任務"
        subtitle="即時追蹤部門間派工；LINE 回覆「接單／此單已完成」或 Flex 按鈕時，此處自動更新。"
        accent="sky"
        meta={
          hotelId ? (
            <span className="text-xs text-slate-400">Hotel · {hotelId}</span>
          ) : null
        }
      />

      {(error || formError) && (
        <AlertBanner variant="error">{error || formError}</AlertBanner>
      )}

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="mb-8 grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:grid-cols-[160px_1fr_auto]"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">目標部門</span>
          <select
            className="glog-input w-full"
            value={toDepartment}
            onChange={(e) =>
              setToDepartment(e.target.value as CrossDeptDepartment)
            }
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPT_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-1">
          <span className="mb-1 block text-slate-500">任務說明</span>
          <input
            className="glog-input w-full"
            placeholder="例：需採購 101 房水龍頭零件"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting}
            className="glog-btn-primary w-full sm:w-auto"
          >
            {submitting ? "派送中…" : "派工並通知"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : tickets.length === 0 ? (
        <EmptyState
          message="目前沒有進行中的跨部門任務"
          hint="從上方表單派工，或在 LINE 傳送「派工 採購 說明內容」。"
        />
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => {
            const status = t.status as CrossDeptTicketStatus;
            return (
              <li
                key={t.id}
                className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 transition-shadow duration-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {t.caseNumber && (
                        <span className="mr-2 font-mono text-xs text-slate-500">
                          {t.caseNumber}
                        </span>
                      )}
                      {DEPT_LABELS[t.fromDepartment] ?? t.fromDepartment}
                      <span className="mx-1.5 text-slate-300">→</span>
                      {DEPT_LABELS[t.toDepartment] ?? t.toDepartment}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      發起：{t.createdBy?.name ?? "—"}
                      {t.handledBy?.name ? ` · 處理：${t.handledBy.name}` : ""}
                      {" · "}
                      {t.createdAt
                        ? new Date(t.createdAt).toLocaleString("zh-TW")
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_CLASS[status]}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                {status === "delayed" && t.delayReason && (
                  <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    延遲原因：{t.delayReason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
