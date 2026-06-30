import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreateTicketModal } from "../components/CreateTicketModal";
import { PriorityBadge, StaleBadge, TicketStatusBadge } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import {
  countStaleTickets,
  formatStaleDuration,
  getStaleDurationMs,
  isTicketStale,
  ticketListItemClass,
} from "../lib/ticketStale";
import type { MaintenanceTicket, TicketPriority, TicketStatus, UserRole } from "../types/api";

const CREATE_ROLES: UserRole[] = ["ADMIN", "FRONT_DESK", "HOUSEKEEPING"];

const FILTER_OPTIONS: { value: TicketStatus | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "OPEN", label: "待派單" },
  { value: "ASSIGNED", label: "已指派" },
  { value: "IN_PROGRESS", label: "進行中" },
  { value: "PENDING_FRONT_DESK", label: "待前台" },
  { value: "CLOSED", label: "已結案" },
];

const PRIORITY_RANK: Record<TicketPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function sortTickets(list: MaintenanceTicket[]) {
  return [...list].sort((a, b) => {
    const staleA = isTicketStale(a);
    const staleB = isTicketStale(b);
    if (staleA !== staleB) return staleA ? -1 : 1;

    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;

    return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
  });
}

export function TicketsPage() {
  const { profile, getToken } = useAuth();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [filter, setFilter] = useState<TicketStatus | "">("");
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const isEngineer = profile?.role === "ENGINEER";

  async function loadTickets() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const params: { status?: TicketStatus; assignedToId?: string } = {};
      if (filter) params.status = filter;
      if (mineOnly && profile) params.assignedToId = profile.id;
      const { tickets: list } = await api.getTickets(token, params);
      setTickets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [filter, mineOnly]);

  const canCreate = profile && CREATE_ROLES.includes(profile.role);
  const sortedTickets = useMemo(() => sortTickets(tickets), [tickets]);
  const staleCount = countStaleTickets(tickets);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">工程維修工單</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isEngineer
              ? "查看指派給您的維修任務，逾時項目請優先處理"
              : "客房與設備報修，系統依技能自動派給工程部"}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + 報修
          </button>
        )}
      </div>

      {staleCount > 0 && (
        <div className="mb-4 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-900">
            {staleCount} 項任務逾時未更新（超過 2 小時）
          </p>
          <p className="mt-0.5 text-xs text-red-700">
            逾時工單以紅框標示，請優先跟進
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isEngineer && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              mineOnly
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            我的工單
          </button>
        )}
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
      ) : sortedTickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="text-slate-500">
            {mineOnly ? "目前沒有指派給您的工單" : "尚無工單"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTickets.map((ticket) => {
            const stale = isTicketStale(ticket);
            return (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className={ticketListItemClass(stale)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-slate-900">{ticket.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {ticket.asset.code} · {ticket.asset.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {stale && (
                      <StaleBadge
                        durationLabel={formatStaleDuration(getStaleDurationMs(ticket))}
                      />
                    )}
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <PriorityBadge priority={ticket.priority} />
                  {ticket.assignedTo ? (
                    <span>工程師：{ticket.assignedTo.name}</span>
                  ) : (
                    <span className="text-amber-700">待工程部派工</span>
                  )}
                  <span>
                    建立：{new Date(ticket.triggeredAt).toLocaleString("zh-TW")}
                  </span>
                  {stale && ticket.updatedAt && (
                    <span className="font-medium text-red-600">
                      上次更新：{new Date(ticket.updatedAt).toLocaleString("zh-TW")}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
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
