import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PlatformTenantFilter,
  TenantLabel,
  usePlatformTenants,
} from "../../components/PlatformTenantFilter";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { FilterChip } from "../../components/ui/FilterChip";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type { PlatformInventoryItem } from "../../types/platform";

export function PlatformInventoryPage() {
  const { getToken } = useAuth();
  const { tenants } = usePlatformTenants();
  const [tenantId, setTenantId] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [items, setItems] = useState<PlatformInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getToken("platform");
        const { items: list } = await platformApi.getInventory(token, {
          tenantId: tenantId || undefined,
          lowStock: showLowOnly || undefined,
        });
        setItems(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, tenantId, showLowOnly]);

  return (
    <div>
      <PageHeader
        title="耗材庫存"
        subtitle="跨飯店庫存總覽與低庫存監控"
        accent="violet"
        action={
          <div className="flex flex-wrap gap-2">
            <PlatformTenantFilter tenants={tenants} value={tenantId} onChange={setTenantId} />
            <FilterChip
              label="僅顯示低庫存"
              active={showLowOnly}
              onClick={() => setShowLowOnly(!showLowOnly)}
            />
          </div>
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : items.length === 0 ? (
        <EmptyState message="尚無庫存資料" />
      ) : (
        <div className="glog-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">飯店</th>
                <th className="px-4 py-3 font-medium">耗材</th>
                <th className="px-4 py-3 font-medium">庫存</th>
                <th className="px-4 py-3 font-medium">單位成本</th>
                <th className="px-4 py-3 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => {
                const isLow = item.quantity <= item.reorderLevel;
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {item.tenant ? (
                        <Link
                          to={`/manager/tenants/${item.tenant.id}`}
                          className="text-violet-600 hover:underline"
                        >
                          <TenantLabel name={item.tenant.name} slug={item.tenant.slug} />
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.sku ?? "無料號"} · {item.category ?? "未分類"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.quantity} {item.unit}
                      <span className="ml-1 text-xs text-slate-400">
                        （安全量 {item.reorderLevel}）
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">NT$ {item.unitCost}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          低庫存
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          正常
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
