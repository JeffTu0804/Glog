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
  const { getToken } = useAuth();
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">glog Manager</h1>
        <p className="mt-1 text-sm text-slate-400">管理所有租用 glog 的飯店客戶與平台營運設定</p>
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
              className="rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Manager 權限申請</h2>
            <p className="mt-1 text-sm text-slate-400">新申請者會先停留在待審核，核准後才能登入 Manager 後台。</p>
          </div>
          <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
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
                className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="font-medium text-white">{request.name || "未提供姓名"}</p>
                  <p className="text-sm text-slate-400">{request.email || request.id}</p>
                  <p className="mt-1 text-xs text-slate-500">
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
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-red-500 hover:text-red-300"
                  >
                    拒絕
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReview(request.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === opt.value
                ? "bg-violet-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
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
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          搜尋
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
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
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{tenant.name}</p>
                    <p className="text-xs text-slate-500">{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={tenant.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <SubscriptionBadge status={tenant.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {tenant.stats?.userCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {tenant.stats?.ticketCount ?? 0}
                    {(tenant.stats?.openTicketCount ?? 0) > 0 && (
                      <span className="ml-1 text-amber-400">
                        ({tenant.stats?.openTicketCount} 進行中)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    NT$ {tenant.stats?.totalCost ?? "0"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/manager/tenants/${tenant.id}`}
                      className="text-violet-400 hover:text-violet-300"
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
