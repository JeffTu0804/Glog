import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreateTicketModal } from "../components/CreateTicketModal";
import { PriorityBadge, TicketStatusBadge } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { MaintenanceTicket, TicketStatus, UserRole } from "../types/api";

const CREATE_ROLES: UserRole[] = ["ADMIN", "FRONT_DESK", "HOUSEKEEPING"];

const FILTER_OPTIONS: { value: TicketStatus | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "OPEN", label: "待派單" },
  { value: "ASSIGNED", label: "已指派" },
  { value: "IN_PROGRESS", label: "進行中" },
  { value: "CLOSED", label: "已結案" },
];

export function TicketsPage() {
  const { profile, getToken } = useAuth();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [filter, setFilter] = useState<TicketStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function loadTickets() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { tickets: list } = await api.getTickets(
        token,
        filter ? { status: filter } : undefined,
      );
      setTickets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [filter]);

  const canCreate = profile && CREATE_ROLES.includes(profile.role);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">維修工單</h1>
          <p className="mt-1 text-sm text-slate-500">管理客房與設備報修</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + 建立工單
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === opt.value
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="text-slate-500">尚無工單</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/tickets/${ticket.id}`}
              className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-slate-900">{ticket.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {ticket.asset.code} · {ticket.asset.name}
                  </p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <PriorityBadge priority={ticket.priority} />
                {ticket.assignedTo && (
                  <span>工程師：{ticket.assignedTo.name}</span>
                )}
                <span>{new Date(ticket.triggeredAt).toLocaleString("zh-TW")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateTicketModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void loadTickets()}
      />
    </div>
  );
}
