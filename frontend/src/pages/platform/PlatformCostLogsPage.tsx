import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PlatformTenantFilter,
  TenantLabel,
  usePlatformTenants,
} from "../../components/PlatformTenantFilter";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type { PlatformCostLog } from "../../types/platform";

export function PlatformCostLogsPage() {
  const { getToken } = useAuth();
  const { tenants } = usePlatformTenants();
  const [tenantId, setTenantId] = useState("");
  const [costLogs, setCostLogs] = useState<PlatformCostLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getToken("platform");
        const { costLogs: list } = await platformApi.getCostLogs(token, {
          tenantId: tenantId || undefined,
        });
        setCostLogs(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, tenantId]);

  const total = costLogs.reduce((sum, log) => sum + Number(log.amount), 0);

  return (
    <div>
      <PageHeader
        title="成本紀錄"
        subtitle={`跨飯店維修成本 · 篩選結果累計 NT$ ${total.toLocaleString()}`}
        accent="violet"
        action={
          <PlatformTenantFilter tenants={tenants} value={tenantId} onChange={setTenantId} />
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : costLogs.length === 0 ? (
        <EmptyState message="尚無成本紀錄" />
      ) : (
        <div className="space-y-3">
          {costLogs.map((log) => (
            <div
              key={log.id}
              className="glog-card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  {log.tenant && (
                    <Link
                      to={`/manager/tenants/${log.tenant.id}`}
                      className="text-sm text-violet-600 hover:underline"
                    >
                      <TenantLabel name={log.tenant.name} slug={log.tenant.slug} />
                    </Link>
                  )}
                </div>
                <p className="font-medium text-slate-900">{log.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {log.category ?? "未分類"} ·{" "}
                  {log.ticket
                    ? `${log.ticket.asset.code} — ${log.ticket.title}`
                    : "無關聯工單"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-emerald-600">NT$ {log.amount}</p>
                <p className="text-xs text-slate-400">
                  {new Date(log.recordedAt).toLocaleDateString("zh-TW")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
