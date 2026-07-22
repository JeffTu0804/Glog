import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { ROLE_LABELS } from "../components/TicketBadges";
import type { User } from "../types/api";

export function UsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const { users: list } = await api.getUsers(token);
        setUsers(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">員工管理</h1>
        <p className="mt-1 text-sm text-slate-500">飯店內部人員與角色</p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">技能標籤</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {ROLE_LABELS[user.role]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.status === "IDLE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {user.status === "IDLE" ? "閒置" : "忙碌"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {(user.skills ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(user.skills ?? []).map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                          >
                            {s}
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
