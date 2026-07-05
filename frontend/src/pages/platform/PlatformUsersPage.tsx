import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROLE_LABELS } from "../../components/TicketBadges";
import {
  PlatformTenantFilter,
  TenantLabel,
  usePlatformTenants,
} from "../../components/PlatformTenantFilter";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type { PlatformTenantUser } from "../../types/platform";

export function PlatformUsersPage() {
  const { getToken } = useAuth();
  const { tenants } = usePlatformTenants();
  const [tenantId, setTenantId] = useState("");
  const [users, setUsers] = useState<PlatformTenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getToken("platform");
        const { users: list } = await platformApi.getUsers(token, {
          tenantId: tenantId || undefined,
        });
        setUsers(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, tenantId]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">員工管理</h1>
          <p className="mt-1 text-sm text-slate-500">跨飯店內部人員與角色</p>
        </div>
        <PlatformTenantFilter tenants={tenants} value={tenantId} onChange={setTenantId} />
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
          尚無員工資料
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">飯店</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">技能標籤</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {user.tenant ? (
                      <Link
                        to={`/manager/tenants/${user.tenant.id}`}
                        className="text-violet-600 hover:underline"
                      >
                        <TenantLabel name={user.tenant.name} slug={user.tenant.slug} />
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.status === "IDLE"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {user.status === "IDLE" ? "閒置" : "忙碌"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {user.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
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
