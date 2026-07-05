import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreateTicketModal } from "../components/CreateTicketModal";
import { PriorityBadge, StaleBadge, TicketStatusBadge } from "../components/TicketBadges";
import { AlertBanner } from "../components/ui/AlertBanner";
import { EmptyState } from "../components/ui/EmptyState";
import { FilterChip } from "../components/ui/FilterChip";
import { PageHeader } from "../components/ui/PageHeader";
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
      <PageHeader
        title="工程部"
        subtitle={
          isEngineer
            ? "查看指派給您的維修任務，逾時項目請優先處理"
            : "客房與設備報修，部門接單後上傳照片完成回報"
        }
        accent="blue"
        action={
          canCreate ? (
            <button type="button" onClick={() => setShowCreate(true)} className="glog-btn-primary">
              + 報修
            </button>
          ) : undefined
        }
      />

      {staleCount > 0 && (
        <AlertBanner variant="warning" className="border-2 border-red-300 bg-red-50 text-red-900">
          <span className="font-semibold">{staleCount} 項任務逾時未更新（超過 2 小時）</span>
          <span className="mt-0.5 block text-xs opacity-80">逾時工單以紅框標示，請優先跟進</span>
        </AlertBanner>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {isEngineer && (
          <FilterChip label="我的工單" active={mineOnly} onClick={() => setMineOnly((v) => !v)} />
        )}
        {FILTER_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.label}
            label={opt.label}
            active={filter === opt.value}
            onClick={() => setFilter(opt.value)}
          />
        ))}
      </div>

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : sortedTickets.length === 0 ? (
        <EmptyState message={mineOnly ? "目前沒有指派給您的工單" : "尚無工單"} />
      ) : (
        <div className="space-y-3">
          {sortedTickets.map((ticket) => {
            const stale = isTicketStale(ticket);
            return (
              <Link key={ticket.id} to={`/tickets/${ticket.id}`} className={ticketListItemClass(stale)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{ticket.title}</h3>
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
                    <span className="font-medium text-amber-700">待工程部派工</span>
                  )}
                  <span>建立：{new Date(ticket.triggeredAt).toLocaleString("zh-TW")}</span>
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
