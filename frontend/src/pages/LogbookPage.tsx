import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AlertBanner } from "../components/ui/AlertBanner";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../lib/api";
import {
  ALL_DEPARTMENTS,
  canAccessDepartment,
  DEPARTMENT_LABELS,
  roleToDepartment,
} from "../lib/department";
import type { Department, LogbookCurrentResponse, ShiftLogbook } from "../types/api";

export function LogbookPage() {
  const { getToken, profile } = useAuth();
  const defaultDepartment = profile ? roleToDepartment(profile.role) : "FRONT_DESK";
  const isAdmin = profile?.role === "ADMIN";

  const [department, setDepartment] = useState<Department>(defaultDepartment);
  const [data, setData] = useState<LogbookCurrentResponse | null>(null);
  const [history, setHistory] = useState<ShiftLogbook[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDepartment(roleToDepartment(profile.role));
    }
  }, [profile?.id, profile?.role]);

  async function load(dept: Department) {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const [current, list] = await Promise.all([
        api.getLogbookCurrent(token, dept),
        api.listLogbooks(token, dept),
      ]);
      setData(current);
      setHistory(list.logbooks.filter((l) => l.status === "PUBLISHED"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(department);
  }, [getToken, department]);

  const viewing =
    selectedId != null
      ? history.find((h) => h.id === selectedId) ??
        (data?.logbook.id === selectedId ? data.logbook : null)
      : null;

  const displayLogbook = viewing ?? data?.logbook ?? null;
  const isCurrentOpen = displayLogbook?.id === data?.logbook.id && data?.logbook.status === "OPEN";

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!data?.logbook || !note.trim()) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const token = await getToken();
      const result = await api.addLogbookEntry(token, data.logbook.id, note.trim());
      setNote("");
      if (result.ticketAlert) {
        setSuccess(result.ticketAlert.message);
      }
      await load(department);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增備註失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    if (!data?.logbook) return;
    if (
      !confirm(
        `確定要產生 ${DEPARTMENT_LABELS[department]} AI 交班摘要並完成交班？\n交班後將透過 LINE 推播給部門同仁。`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.publishLogbook(token, data.logbook.id);
      await load(department);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "交班失敗");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDepartmentChange(next: Department) {
    if (!profile || !canAccessDepartment(profile.role, next)) return;
    setDepartment(next);
    setSelectedId(null);
  }

  if (loading && !data) {
    return <p className="text-slate-500">載入中…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 交班日誌"
        subtitle="記錄本班事件，交班時自動產生摘要給接班同仁"
        accent="violet"
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="logbook-department" className="text-sm text-slate-600">
              部門
            </label>
            {isAdmin ? (
              <select
                id="logbook-department"
                value={department}
                onChange={(e) => handleDepartmentChange(e.target.value as Department)}
                className="glog-select"
              >
                {ALL_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {DEPARTMENT_LABELS[dept]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-xl bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/80">
                {DEPARTMENT_LABELS[department]}
              </span>
            )}
          </div>
        }
        action={
          data && isCurrentOpen ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handlePublish()}
              className="glog-btn-primary"
            >
              {submitting ? "處理中…" : "完成交班 · 產生 AI 摘要"}
            </button>
          ) : undefined
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}
      {success && <AlertBanner variant="success">{success}</AlertBanner>}

      {data && (
        <div className="glog-card border border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 p-5">
          <p className="text-sm font-semibold text-blue-900">
            {DEPARTMENT_LABELS[department]} · 目前班別：{data.shift.label}（{data.shift.window}）
          </p>
          <p className="mt-1 text-xs text-blue-700/80">
            狀態：{data.logbook.status === "OPEN" ? "進行中" : "已交班"}
          </p>
        </div>
      )}

      {data?.previousHandover && selectedId === null && (
        <section className="glog-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              上一班交班摘要
              <span className="ml-2 text-sm font-normal text-slate-500">
                {data.previousHandover.shiftLabel} · {data.previousHandover.shiftDate}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setSelectedId(data.previousHandover!.id)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              查看完整 →
            </button>
          </div>

          {data.previousHandover.highlights.length > 0 && (
            <ul className="mb-4 space-y-1">
              {data.previousHandover.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-sm text-slate-700">
                  <span className="text-emerald-500">•</span>
                  {h}
                </li>
              ))}
            </ul>
          )}

          {data.previousHandover.openItems.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-medium text-amber-900">待追蹤事項</p>
              <ul className="space-y-1">
                {data.previousHandover.openItems.map((item) => (
                  <li key={item} className="text-sm text-amber-800">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.previousHandover.aiSummary && (
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {data.previousHandover.aiSummary}
            </pre>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <section className="glog-card p-5">
            <h2 className="font-semibold text-slate-900">本班備註</h2>
            <p className="mt-1 text-xs text-slate-500">記錄臨時狀況、客訴、特殊事項</p>

            {isCurrentOpen ? (
              <form onSubmit={(e) => void handleAddNote(e)} className="mt-4 space-y-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="例：302 房客人反應冷氣不冷（含房號+問題會自動開工單並 LINE 通知工程部）"
                  className="glog-input resize-none"
                />
                <button
                  type="submit"
                  disabled={submitting || !note.trim()}
                  className="glog-btn-primary w-full disabled:opacity-50"
                >
                  新增備註
                </button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-slate-500">本班已交班，無法新增備註</p>
            )}

            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {(displayLogbook?.entries ?? []).map((entry) => (
                <li key={entry.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="text-slate-800">{entry.content}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {entry.author.name} · {new Date(entry.createdAt).toLocaleString("zh-TW")}
                  </p>
                </li>
              ))}
              {(displayLogbook?.entries.length ?? 0) === 0 && (
                <li className="text-sm text-slate-400">尚無備註</li>
              )}
            </ul>
          </section>

          <section className="glog-card p-5">
            <h2 className="font-semibold text-slate-900">歷史交班</h2>
            <ul className="mt-3 space-y-1">
              {history.map((lb) => (
                <li key={lb.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(lb.id)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      selectedId === lb.id
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {lb.shiftLabel} · {lb.shiftDate}
                  </button>
                </li>
              ))}
              {history.length === 0 && (
                <li className="text-sm text-slate-400">尚無歷史紀錄</li>
              )}
            </ul>
            {selectedId && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                ← 返回目前班別
              </button>
            )}
          </section>
        </div>

        <div className="lg:col-span-2">
          <section className="glog-card relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-50/80" />
            <h2 className="relative text-lg font-semibold text-slate-900">
              {displayLogbook?.status === "PUBLISHED" ? "交班摘要" : "交班摘要預覽"}
            </h2>
            <p className="relative mt-1 text-sm text-slate-500">
              {displayLogbook?.status === "OPEN"
                ? "完成交班後，系統會彙整工單、地點、庫存與備註並產生 AI 摘要，並透過 LINE 推播給部門同仁"
                : `由 ${displayLogbook?.publishedBy?.name ?? "—"} 於 ${displayLogbook?.publishedAt ? new Date(displayLogbook.publishedAt).toLocaleString("zh-TW") : "—"} 交班`}
            </p>

            {displayLogbook?.status === "PUBLISHED" && displayLogbook.aiSummary ? (
              <div className="relative mt-4 space-y-4">
                {displayLogbook.highlights.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">重點摘要</p>
                    <ul className="space-y-1">
                      {displayLogbook.highlights.map((h) => (
                        <li key={h} className="text-sm text-slate-600">
                          ✓ {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {displayLogbook.openItems.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-2 text-sm font-medium text-amber-900">待接班追蹤</p>
                    <ul className="space-y-1">
                      {displayLogbook.openItems.map((item) => (
                        <li key={item} className="text-sm text-amber-800">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                  {displayLogbook.aiSummary}
                </pre>
              </div>
            ) : (
              <div className="relative mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <p className="text-sm text-slate-500">
                  交班前可先新增備註，完成交班後會自動產生完整摘要
                </p>
                <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-xs text-slate-400">
                  <li>· 本班新增與更新的工單</li>
                  <li>· 故障 / 維護中地點</li>
                  <li>· 庫存不足警示</li>
                  <li>· 手動備註事項</li>
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
