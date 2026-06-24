import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { CostLog } from "../types/api";

export function CostLogsPage() {
  const { getToken } = useAuth();
  const [costLogs, setCostLogs] = useState<CostLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const { costLogs: list } = await api.getCostLogs(token);
        setCostLogs(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const total = costLogs.reduce((sum, log) => sum + Number(log.amount), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">成本紀錄</h1>
        <p className="mt-1 text-sm text-slate-500">
          維修耗材與人工成本 · 累計 NT$ {total.toLocaleString()}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : costLogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
          尚無成本紀錄（工單結案後自動產生）
        </div>
      ) : (
        <div className="space-y-2">
          {costLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-slate-200"
            >
              <div>
                <p className="font-medium text-slate-900">{log.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {log.category ?? "未分類"} ·{" "}
                  {log.ticket ? (
                    <Link
                      to={`/tickets/${log.ticket.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {log.ticket.asset.code} — {log.ticket.title}
                    </Link>
                  ) : (
                    "無關聯工單"
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-emerald-700">NT$ {log.amount}</p>
                <p className="text-xs text-slate-500">
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
