import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlanBadge, SubscriptionBadge } from "../../components/PlatformBadges";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type { PlatformOverview, SubscriptionStatus, Tenant } from "../../types/platform";

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
  const [filter, setFilter] = useState<SubscriptionStatus | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const [statsRes, tenantsRes] = await Promise.all([
        platformApi.getStats(token),
        platformApi.getTenants(token, {
          status: filter || undefined,
          search: search || undefined,
        }),
      ]);
      setStats(statsRes.stats);
      setTenants(tenantsRes.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filter]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">平台營運總覽</h1>
        <p className="mt-1 text-sm text-slate-400">管理所有租用 glog 的飯店客戶</p>
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
                      to={`/platform/tenants/${tenant.id}`}
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
