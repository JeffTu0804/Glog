import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PriorityBadge, TicketStatusBadge } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { InventoryItem, MaintenanceTicket, User } from "../types/api";

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, getToken } = useAuth();
  const [ticket, setTicket] = useState<MaintenanceTicket | null>(null);
  const [engineers, setEngineers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 派單
  const [assignToId, setAssignToId] = useState("");

  // 結案
  const [selectedInventory, setSelectedInventory] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [laborCost, setLaborCost] = useState(0);

  async function loadTicket() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { ticket: data } = await api.getTicket(token, id);
      setTicket(data);

      if (profile?.role === "ADMIN" && data.status === "OPEN") {
        const { users } = await api.getUsers(token, {
          role: "ENGINEER",
          status: "IDLE",
        });
        setEngineers(users);
        if (users[0]) setAssignToId(users[0].id);
      }

      if (
        (profile?.role === "ENGINEER" || profile?.role === "ADMIN") &&
        data.status === "IN_PROGRESS"
      ) {
        const { items } = await api.getInventory(token);
        setInventory(items);
        if (items[0]) setSelectedInventory(items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTicket();
  }, [id, profile?.role]);

  async function runAction(action: () => Promise<void>) {
    setActionError("");
    setSubmitting(true);
    try {
      await action();
      await loadTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartWork() {
    if (!id) return;
    await runAction(async () => {
      const token = await getToken();
      await api.updateTicketStatus(token, id, "IN_PROGRESS");
    });
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!id || !assignToId) return;
    await runAction(async () => {
      const token = await getToken();
      await api.assignTicket(token, id, assignToId);
    });
  }

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    if (!id || !selectedInventory) return;
    await runAction(async () => {
      const token = await getToken();
      await api.closeTicket(token, id, {
        inventoryUsages: [{ inventoryId: selectedInventory, quantity }],
        laborCost: laborCost > 0 ? laborCost : undefined,
      });
    });
  }

  async function handleCancel() {
    if (!id || !confirm("確定要取消此工單？")) return;
    await runAction(async () => {
      const token = await getToken();
      await api.updateTicketStatus(token, id, "CANCELLED");
    });
  }

  if (loading) {
    return <p className="text-sm text-slate-500">載入中…</p>;
  }

  if (error || !ticket) {
    return (
      <div>
        <p className="text-red-600">{error ?? "找不到工單"}</p>
        <Link to="/tickets" className="mt-4 inline-block text-sm text-indigo-600">
          返回列表
        </Link>
      </div>
    );
  }

  const isAssignedEngineer =
    profile?.role === "ENGINEER" && ticket.assignedTo?.id === profile.id;

  return (
    <div>
        <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
          ← 返回工單列表
        </Link>

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{ticket.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{ticket.description}</p>
          </div>
          <TicketStatusBadge status={ticket.status} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">資產</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {ticket.asset.code} — {ticket.asset.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">優先級</dt>
            <dd className="mt-1">
              <PriorityBadge priority={ticket.priority} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">觸發人</dt>
            <dd className="mt-1 text-sm text-slate-900">{ticket.triggeredBy.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">工程師</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {ticket.assignedTo?.name ?? "尚未指派"}
            </dd>
          </div>
        </dl>
      </div>

      {actionError && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {/* 管理員：手動派單 */}
      {profile?.role === "ADMIN" && ticket.status === "OPEN" && (
        <form
          onSubmit={(e) => void handleAssign(e)}
          className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200"
        >
          <h2 className="font-medium text-slate-900">手動派單</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={assignToId}
              onChange={(e) => setAssignToId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} ({eng.skills.join(", ") || "無標籤"})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting || engineers.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              指派工程師
            </button>
          </div>
        </form>
      )}

      {/* 工程師：開始作業 */}
      {isAssignedEngineer && ticket.status === "ASSIGNED" && (
        <div className="mt-6">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleStartWork()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            開始作業
          </button>
        </div>
      )}

      {/* 工程師 / 管理員：結案 */}
      {(isAssignedEngineer || profile?.role === "ADMIN") &&
        ticket.status === "IN_PROGRESS" && (
          <form
            onSubmit={(e) => void handleClose(e)}
            className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200"
          >
            <h2 className="font-medium text-slate-900">完工結案</h2>
            <p className="mt-1 text-sm text-slate-500">
              結案將扣除庫存並寫入成本紀錄
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <select
                value={selectedInventory}
                onChange={(e) => setSelectedInventory(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（庫存 {item.quantity}）
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="數量"
              />
              <input
                type="number"
                min={0}
                value={laborCost}
                onChange={(e) => setLaborCost(Number(e.target.value))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="人工費（選填）"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              確認結案
            </button>
          </form>
        )}

      {/* 管理員：取消 */}
      {profile?.role === "ADMIN" &&
        ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(ticket.status) && (
          <div className="mt-6">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleCancel()}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              取消工單
            </button>
          </div>
        )}

      {ticket.status === "CLOSED" && (
        <p className="mt-6 text-sm text-emerald-700">
          此工單已結案 · {ticket.closedAt && new Date(ticket.closedAt).toLocaleString("zh-TW")}
        </p>
      )}
    </div>
  );
}
