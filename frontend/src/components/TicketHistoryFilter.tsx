import { FilterChip } from "./ui/FilterChip";
import {
  useTicketHistory,
  type TicketHistoryDepartment,
  type TicketHistoryStatusTab,
} from "../hooks/useTicketHistory";

const STATUS_TABS: { id: TicketHistoryStatusTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待處理" },
  { id: "in_progress", label: "進行中" },
  { id: "completed", label: "已完成" },
];

const DEPARTMENTS: { id: TicketHistoryDepartment; label: string }[] = [
  { id: "all", label: "全部部門" },
  { id: "front_desk", label: "客務部" },
  { id: "housekeeping", label: "房務部" },
  { id: "engineering", label: "工程部" },
  { id: "purchasing", label: "餐飲部" },
];

const DEPT_LABELS: Record<string, string> = {
  front_desk: "客務部",
  housekeeping: "房務部",
  engineering: "工程部",
  purchasing: "採購",
  spa: "SPA",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "進行中",
  completed: "已完成",
  delayed: "已延遲",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  processing: "bg-sky-50 text-sky-800 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  delayed: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function TicketHistoryFilter() {
  const {
    statusTab,
    setStatusTab,
    department,
    setDepartment,
    searchInput,
    setSearchInput,
    tickets,
    loading,
    error,
  } = useTicketHistory();

  return (
    <section className="glog-card space-y-4 p-5">
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <FilterChip
            key={tab.id}
            label={tab.label}
            active={statusTab === tab.id}
            onClick={() => setStatusTab(tab.id)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-[10rem] flex-1 text-sm">
          <span className="mb-1 block text-slate-500">部門</span>
          <select
            className="glog-select w-full"
            value={department}
            onChange={(e) =>
              setDepartment(e.target.value as TicketHistoryDepartment)
            }
          >
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block flex-[2] text-sm">
          <span className="mb-1 block text-slate-500">工單 ID</span>
          <input
            type="search"
            className="glog-input w-full"
            placeholder="輸入序號搜尋 (如：047)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
          <p className="text-sm text-slate-500">沒有符合條件的工單</p>
          <p className="mt-1 text-xs text-slate-400">
            試試切換狀態 Tab，或清空搜尋條件
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {t.caseNumber && (
                      <span className="mr-2 font-mono text-xs font-medium text-blue-600">
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
                  className={`inline-flex shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    STATUS_CLASS[t.status] ?? "bg-slate-50 text-slate-600 ring-slate-200"
                  }`}
                >
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
              {t.status === "delayed" && t.delayReason && (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  延遲原因：{t.delayReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
