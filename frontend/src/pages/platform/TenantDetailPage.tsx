import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlanBadge, STATUS_LABELS, SubscriptionBadge } from "../../components/PlatformBadges";
import {
  PlatformEmployeeTable,
  draftFromUser,
  type EmployeeEditDraft,
} from "../../components/PlatformEmployeeTable";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type {
  PlatformCostLog,
  PlatformInventoryItem,
  PlatformTenantUser,
  PlatformTicket,
  SubscriptionPlan,
  SubscriptionStatus,
  Tenant,
} from "../../types/platform";

type Tab = "tickets" | "costs" | "inventory" | "users";

function buildCostTrend(costLogs: PlatformCostLog[]) {
  const monthly = new Map<string, number>();

  for (const log of costLogs) {
    const date = new Date(log.recordedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + Number(log.amount));
  }

  return Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([label, value]) => ({ label, value }));
}

function CostLineChart({ logs }: { logs: PlatformCostLog[] }) {
  const points = buildCostTrend(logs);
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-500">
        尚無足夠成本資料可繪製曲線圖
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padding = 24;
  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const path = points
    .map((point, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (point.value / max) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-900">最近 6 個月成本趨勢</h3>
        <span className="text-xs text-slate-500">NT$</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <path d={path} fill="none" stroke="#7c3aed" strokeWidth="3" />
        {points.map((point, index) => {
          const x = padding + index * stepX;
          const y = height - padding - (point.value / max) * (height - padding * 2);
          return (
            <g key={point.label}>
              <circle cx={x} cy={y} r="4" fill="#a78bfa" />
              <text x={x} y={height - 4} textAnchor="middle" fontSize="11" fill="#64748b">
                {point.label.slice(5)}
              </text>
              <text x={x} y={y - 10} textAnchor="middle" fontSize="11" fill="#334155">
                {Math.round(point.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>("tickets");
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [costLogs, setCostLogs] = useState<PlatformCostLog[]>([]);
  const [inventory, setInventory] = useState<PlatformInventoryItem[]>([]);
  const [users, setUsers] = useState<PlatformTenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<EmployeeEditDraft | null>(null);
  const [userSuccess, setUserSuccess] = useState("");

  async function loadTenant() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { tenant: data } = await platformApi.getTenant(token, id);
      setTenant(data);

      const [ticketsRes, costsRes, inventoryRes, usersRes] = await Promise.all([
        platformApi.getTenantTickets(token, id),
        platformApi.getTenantCostLogs(token, id),
        platformApi.getTenantInventory(token, id),
        platformApi.getTenantUsers(token, id),
      ]);
      setTickets(ticketsRes.tickets);
      setCostLogs(costsRes.costLogs);
      setInventory(inventoryRes.items);
      setUsers(usersRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTenant();
  }, [id]);

  async function handleSubscriptionUpdate(
    field: "plan" | "subscriptionStatus",
    value: string,
  ) {
    if (!id) return;
    setSaving(true);
    try {
      const token = await getToken();
      await platformApi.updateSubscription(token, id, {
        [field]: value as SubscriptionPlan & SubscriptionStatus,
      });
      await loadTenant();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveUser(userId: string) {
    if (!userDraft || !id) return;
    setSavingUserId(userId);
    setError("");
    setUserSuccess("");
    try {
      const token = await getToken();
      const { user } = await platformApi.updateUser(token, userId, {
        tenantId: id,
        role: userDraft.role,
        name: userDraft.name,
        accountStatus: userDraft.accountStatus,
        positionLevel: userDraft.positionLevel,
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? user : u)));
      setEditingUserId(null);
      setUserDraft(null);
      setUserSuccess("已儲存員工資料");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading) return <p className="text-slate-500">載入中…</p>;
  if (error || !tenant) {
    return (
      <div>
        <p className="text-red-600">{error ?? "找不到租戶"}</p>
        <Link to="/manager" className="mt-4 inline-block text-violet-600 hover:underline">
          返回總覽
        </Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "tickets", label: "工單歷史", count: tickets.length },
    { key: "costs", label: "成本紀錄", count: costLogs.length },
    { key: "inventory", label: "庫存", count: inventory.length },
    { key: "users", label: "員工", count: users.length },
  ];

  return (
    <div>
      <Link to="/manager" className="text-sm text-violet-600 hover:underline">
        ← 返回租戶總覽
      </Link>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {tenant.slug} · {tenant.contactEmail ?? "無聯絡 email"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              加入時間 {new Date(tenant.createdAt).toLocaleDateString("zh-TW")}
            </p>
          </div>
          <div className="flex gap-2">
            <PlanBadge plan={tenant.plan} />
            <SubscriptionBadge status={tenant.subscriptionStatus} />
          </div>
        </div>

        {tenant.stats && (
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {[
              { label: "員工", value: tenant.stats.userCount },
              { label: "資產", value: tenant.stats.assetCount },
              { label: "工單", value: tenant.stats.ticketCount },
              { label: "累計成本", value: `NT$ ${tenant.stats.totalCost}` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-lg font-semibold text-slate-900">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <select
            value={tenant.plan}
            disabled={saving}
            onChange={(e) =>
              void handleSubscriptionUpdate("plan", e.target.value)
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            {Object.entries({ TRIAL: "試用", STARTER: "入門", PRO: "專業", ENTERPRISE: "企業" }).map(
              ([k, v]) => (
                <option key={k} value={k}>
                  方案：{v}
                </option>
              ),
            )}
          </select>
          <select
            value={tenant.subscriptionStatus}
            disabled={saving}
            onChange={(e) =>
              void handleSubscriptionUpdate("subscriptionStatus", e.target.value)
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                狀態：{v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 flex gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-b-2 border-violet-600 text-violet-600"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "tickets" && (
          <div className="space-y-2">
            {tickets.length === 0 ? (
              <p className="text-slate-500">尚無工單紀錄</p>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex justify-between">
                    <p className="font-medium text-slate-900">{t.title}</p>
                    <span className="text-xs text-slate-500">{t.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {t.asset.code} · {t.asset.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t.assignedTo
                      ? `工程師：${t.assignedTo.name}`
                      : "未指派"}{" "}
                    · {new Date(t.createdAt).toLocaleString("zh-TW")}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "costs" && (
          <div className="space-y-4">
            <CostLineChart logs={costLogs} />
            {costLogs.length === 0 ? (
              <p className="text-slate-500">尚無成本紀錄</p>
            ) : (
              costLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{log.description}</p>
                    <p className="text-xs text-slate-500">
                      {log.category} ·{" "}
                      {log.ticket
                        ? `${log.ticket.asset.code} — ${log.ticket.title}`
                        : "無關聯工單"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-emerald-600">NT$ {log.amount}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(log.recordedAt).toLocaleDateString("zh-TW")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-3">
            {inventory.length === 0 ? (
              <p className="text-slate-500">尚無庫存資料</p>
            ) : (
              inventory.map((item) => {
                const isLow = item.quantity <= item.reorderLevel;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.category ?? "未分類"} · {item.sku ?? "無料號"}
                        </p>
                      </div>
                      {isLow && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          低庫存
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-slate-700">
                        庫存：{item.quantity} {item.unit}
                      </span>
                      <span className="text-slate-500">
                        安全量：{item.reorderLevel} · NT$ {item.unitCost}/{item.unit}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "users" && (
          <div>
            {userSuccess && (
              <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {userSuccess}
              </p>
            )}
            <PlatformEmployeeTable
              users={users}
              tenants={tenant ? [tenant] : []}
              showHotel={false}
              editingId={editingUserId}
              savingId={savingUserId}
              draft={userDraft}
              onStartEdit={(user) => {
                setEditingUserId(user.id);
                setUserDraft(draftFromUser(user, id));
                setUserSuccess("");
              }}
              onCancelEdit={() => {
                setEditingUserId(null);
                setUserDraft(null);
              }}
              onDraftChange={setUserDraft}
              onSave={(userId) => void handleSaveUser(userId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
