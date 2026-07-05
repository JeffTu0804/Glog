import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlanBadge, SubscriptionBadge } from "../../components/PlatformBadges";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type {
  ManagerAccessRequest,
  PlatformOverview,
  SubscriptionStatus,
  Tenant,
} from "../../types/platform";

const STATUS_FILTERS: { value: SubscriptionStatus | ""; label: string }[] = [
  { value: "", label: "全部狀態" },
  { value: "ACTIVE", label: "使用中" },
  { value: "TRIAL", label: "試用中" },
  { value: "SUSPENDED", label: "已暫停" },
];

export function PlatformDashboardPage() {
  const { getToken, platformAdmin } = useAuth();
  const [stats, setStats] = useState<PlatformOverview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [accessRequests, setAccessRequests] = useState<ManagerAccessRequest[]>([]);
  const [filter, setFilter] = useState<SubscriptionStatus | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const [statsRes, tenantsRes, requestsRes] = await Promise.all([
        platformApi.getStats(token),
        platformApi.getTenants(token, {
          status: filter || undefined,
          search: search || undefined,
        }),
        platformApi.getAccessRequests(token),
      ]);
      setStats(statsRes.stats);
      setTenants(tenantsRes.tenants);
      setAccessRequests(requestsRes.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id: string, decision: "approve" | "reject") {
    try {
      const token = await getToken();
      await platformApi.reviewAccessRequest(token, id, decision);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "審核失敗");
    }
  }

  useEffect(() => {
    void load();
  }, [filter]);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100">
            <svg
              className="h-5 w-5 text-violet-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {platformAdmin?.name ?? "Manager"}，歡迎回到 glog Manager。
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              管理所有租用 glog 的飯店客戶與平台營運設定
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          最後登入：{new Date().toLocaleString("zh-TW")}
        </p>
      </div>

      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "租戶總數", value: stats.tenantCount },
            { label: "活躍租戶", value: stats.activeTenants },
            { label: "全平台工單", value: stats.totalTickets },
            { label: "進行中工單", value: stats.openTickets },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm"
            >
              <p className="text-xs font-medium text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50/50 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Manager 權限申請</h2>
            <p className="mt-1 text-sm text-slate-500">
              新申請者會先停留在待審核，核准後才能登入 Manager 後台。
            </p>
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
            待審核 {accessRequests.length}
          </span>
        </div>

        {accessRequests.length === 0 ? (
          <p className="text-sm text-slate-500">目前沒有待審核的 Manager 權限申請。</p>
        ) : (
          <div className="space-y-3">
            {accessRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{request.name || "未提供姓名"}</p>
                  <p className="text-sm text-slate-500">{request.email || request.id}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    申請時間：
                    {request.managerRequestedAt
                      ? new Date(request.managerRequestedAt).toLocaleString()
                      : "未記錄"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReview(request.id, "reject")}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                  >
                    拒絕
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReview(request.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                  >
                    核准為 Manager
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === opt.value
                ? "bg-violet-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋飯店名稱、slug、email…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
        >
          搜尋
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">飯店</th>
                <th className="px-4 py-3 font-medium">方案</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">員工</th>
                <th className="px-4 py-3 font-medium">工單</th>
                <th className="px-4 py-3 font-medium">累計成本</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{tenant.name}</p>
                    <p className="text-xs text-slate-400">{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={tenant.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <SubscriptionBadge status={tenant.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {tenant.stats?.userCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {tenant.stats?.ticketCount ?? 0}
                    {(tenant.stats?.openTicketCount ?? 0) > 0 && (
                      <span className="ml-1 text-amber-600">
                        ({tenant.stats?.openTicketCount} 進行中)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    NT$ {tenant.stats?.totalCost ?? "0"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/manager/tenants/${tenant.id}`}
                      className="font-medium text-violet-600 transition hover:text-violet-700"
                    >
                      查看詳情 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
