import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FilterChip } from "../../components/ui/FilterChip";
import { PageHeader } from "../../components/ui/PageHeader";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type {
  AnalyticsDepartment,
  AnalyticsPeriod,
  ExecutiveSummary,
  PlatformAnalytics,
} from "../../types/platform";

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "daily", label: "今日查看" },
  { value: "weekly", label: "本週透視" },
  { value: "monthly", label: "本月分析" },
];

const DEPARTMENT_OPTIONS: { value: AnalyticsDepartment; label: string }[] = [
  { value: "all", label: "全體部門" },
  { value: "front_desk", label: "前台客務" },
  { value: "housekeeping", label: "房務部" },
  { value: "engineering", label: "工務部" },
  { value: "fb", label: "餐飲部" },
];

const PIE_COLORS = ["#7c3aed", "#3b82f6", "#f59e0b"];

export function PlatformAnalyticsPage() {
  const { getToken } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>("daily");
  const [selectedDept, setSelectedDept] = useState<AnalyticsDepartment>("all");
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setSummaryLoading(true);
    setError("");
    try {
      const token = await getToken();
      const params = { period, department: selectedDept };
      const [analyticsRes, summaryRes] = await Promise.all([
        platformApi.getAnalytics(token, params),
        platformApi.getAnalyticsAiSummary(token, params),
      ]);
      setAnalytics(analyticsRes.analytics);
      setSummary(summaryRes.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }, [getToken, period, selectedDept]);

  useEffect(() => {
    void load();
  }, [load]);

  const alertTrendData =
    analytics?.alerts.trend.map((row) => ({
      date: row.date.slice(5),
      高風險: row.high,
      中風險: row.medium,
    })) ?? [];

  const isDeptView = selectedDept !== "all";
  const charts = analytics?.charts;

  return (
    <div className="space-y-8">
      <PageHeader
        title="營運洞察報表"
        subtitle="跨租戶工單效率、異常分佈與 AI 營運簡報（支援部門深度解析）"
        accent="violet"
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={period === opt.value}
              onClick={() => setPeriod(opt.value)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {DEPARTMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedDept(opt.value)}
              className={
                selectedDept === opt.value
                  ? "rounded-xl bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm"
                  : "rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-2xl">✨</span>
          <h2 className="text-lg font-bold text-amber-900">
            {isDeptView ? `AI ${analytics?.departmentLabel ?? ""}營運簡報` : "AI 總經理營運日誌摘要"}
          </h2>
          {analytics && (
            <>
              <span className="rounded-full bg-amber-200/60 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                {analytics.periodLabel}
              </span>
              {isDeptView && (
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                  {analytics.departmentLabel}
                </span>
              )}
            </>
          )}
        </div>

        {summaryLoading ? (
          <p className="text-sm text-amber-800/70">AI 正在分析營運數據…</p>
        ) : summary ? (
          <div className="space-y-4">
            <p className="text-base leading-relaxed text-amber-950">
              {summary.executive_summary}
            </p>
            <div>
              <p className="mb-2 text-sm font-semibold text-amber-900">核心問題 Top 3</p>
              <ul className="space-y-1.5">
                {summary.top_3_issues.map((issue, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-amber-900/90"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/50 text-xs font-bold text-amber-900">
                      {i + 1}
                    </span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
            {!isDeptView && (
              <div className="rounded-xl border border-amber-200/60 bg-white/60 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  管理建議
                </p>
                <p className="text-sm leading-relaxed text-amber-950">
                  {summary.management_advice}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-amber-800/70">尚無摘要資料</p>
        )}
      </section>

      {isDeptView && summary?.department_optimization && (
        <section className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xl">💡</span>
            <h3 className="text-base font-bold text-violet-900">部門專屬改善方針</h3>
          </div>
          <p className="text-sm leading-relaxed text-violet-950">
            {summary.department_optimization}
          </p>
          {summary.management_advice && (
            <p className="mt-3 text-xs text-violet-700/80">
              執行建議：{summary.management_advice}
            </p>
          )}
        </section>
      )}

      {loading ? (
        <p className="text-center text-slate-500">載入圖表中…</p>
      ) : analytics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {analytics.kpiCards.map((card) => (
              <StatCard key={card.id} label={card.label} value={card.value} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {charts?.ticketTrend && analytics.ticketTrend.length > 0 && (
              <ChartCard title={selectedDept === "housekeeping" ? "清潔工單趨勢" : "工單趨勢"}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={analytics.ticketTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="created"
                      name="新增"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      name="完工"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts?.categoryBreakdown && analytics.categoryBreakdown.some((c) => c.count > 0) && (
              <ChartCard title="問題分類分佈">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={analytics.categoryBreakdown.filter((c) => c.count > 0)}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(props) => {
                        const name = String(props.name ?? "");
                        const pct = ((props.percent ?? 0) * 100).toFixed(0);
                        return `${name} ${pct}%`;
                      }}
                    >
                      {analytics.categoryBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts?.topProblemRooms && analytics.topProblemRooms.length > 0 && (
              <ChartCard
                title={selectedDept === "front_desk" ? "客訴熱點房號" : "魔王房號排行"}
                className={charts.categoryBreakdown ? "" : "lg:col-span-2"}
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={analytics.topProblemRooms}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="roomNumber"
                      width={60}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" name="問題次數" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts?.alertTrend && alertTrendData.length > 0 && (
              <ChartCard title="告警趨勢" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={alertTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="高風險"
                      stroke="#ef4444"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="中風險"
                      stroke="#f59e0b"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}
    >
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}
