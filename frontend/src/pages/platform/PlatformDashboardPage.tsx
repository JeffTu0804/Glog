import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreateTenantModal } from "../../components/CreateTenantModal";
import { PlanBadge, SubscriptionBadge } from "../../components/PlatformBadges";
import { PageHeader } from "../../components/ui/PageHeader";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { FilterChip } from "../../components/ui/FilterChip";
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
  const [createOpen, setCreateOpen] = useState(false);

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
      <PageHeader
        title={`${platformAdmin?.name ?? "Manager"}，歡迎回來`}
        subtitle="管理所有租用 glog 的飯店客戶與平台營運設定"
        accent="violet"
        meta={
          <p className="text-xs text-slate-400">
            最後登入：{new Date().toLocaleString("zh-TW")}
          </p>
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "租戶總數", value: stats.tenantCount },
            { label: "活躍租戶", value: stats.activeTenants },
            { label: "全平台工單", value: stats.totalTickets },
            { label: "進行中工單", value: stats.openTickets },
          ].map((item) => (
            <div key={item.label} className="glog-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="glog-card mb-8 p-5">
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
          <FilterChip
            key={opt.label}
            label={opt.label}
            active={filter === opt.value}
            onClick={() => setFilter(opt.value)}
          />
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋飯店名稱、slug、email…"
          className="glog-input flex-1 focus:border-violet-400 focus:ring-violet-100"
        />
        <button type="button" onClick={() => void load()} className="glog-btn-manager">
          搜尋
        </button>
      </div>

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

      {/* 右下角浮動按鈕：建立新飯店 */}
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-700 active:scale-[0.98]"
      >
        <span className="text-lg leading-none">＋</span>
        建立新飯店
      </button>

      <CreateTenantModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}
