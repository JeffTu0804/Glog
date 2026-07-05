import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PriorityBadge, StaleBadge, TicketStatusBadge } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import {
  countStaleTickets,
  formatStaleDuration,
  getStaleDurationMs,
  isTicketStale,
  ticketRowClass,
} from "../lib/ticketStale";
import type { MaintenanceTicket } from "../types/api";

export function DashboardPage() {
  const { getToken, profile } = useAuth();
  const [openCount, setOpenCount] = useState(0);
  const [staleCount, setStaleCount] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [recentTickets, setRecentTickets] = useState<MaintenanceTicket[]>([]);
  const [staleTickets, setStaleTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const ticketsRes = await api.getTickets(token);

        const tickets = ticketsRes.tickets;
        const active = tickets.filter((t) =>
          ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(t.status),
        );
        const stale = tickets.filter(isTicketStale);

        setTotalTickets(tickets.length);
        setOpenCount(active.length);
        setStaleCount(countStaleTickets(tickets));
        setStaleTickets(stale);
        setRecentTickets(tickets.slice(0, 5));
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  if (loading) return <p className="text-slate-500">載入中…</p>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          歡迎回來，{profile?.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">飯店後勤營運總覽</p>
      </div>

      {staleCount > 0 && (
        <Link
          to="/tickets"
          className="mb-6 block rounded-xl border-2 border-red-400 bg-red-50 p-5 shadow-sm transition hover:bg-red-100"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-red-900">
                {staleCount} 項任務逾時未更新
              </p>
              <p className="mt-1 text-sm text-red-700">
                以下工單超過 2 小時未更新狀態，請優先處理以免遺漏
              </p>
            </div>
            <span className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">
              立即查看 →
            </span>
          </div>
          {staleTickets.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-red-200 pt-4">
              {staleTickets.slice(0, 3).map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm text-red-900"
                >
                  <span>
                    {ticket.asset.code} · {ticket.title}
                  </span>
                  <StaleBadge
                    durationLabel={formatStaleDuration(getStaleDurationMs(ticket))}
                  />
                </li>
              ))}
              {staleTickets.length > 3 && (
                <li className="text-xs text-red-600">
                  另有 {staleTickets.length - 3} 項…
                </li>
              )}
            </ul>
          )}
        </Link>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {[
          {
            label: "進行中工單",
            value: openCount,
            sub: staleCount > 0 ? `${staleCount} 項逾時` : undefined,
            href: "/tickets",
            color: staleCount > 0 ? "text-red-600" : "text-amber-600",
            ring: staleCount > 0 ? "ring-2 ring-red-300" : "ring-1 ring-slate-200",
          },
          {
            label: "工單總數",
            value: totalTickets,
            href: "/tickets",
            color: "text-indigo-600",
            ring: "ring-1 ring-slate-200",
          },
        ].map((card) => (
          <Link
            key={card.label}
            to={card.href}
            className={`rounded-xl bg-white p-5 shadow-sm transition hover:ring-indigo-300 ${card.ring}`}
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
            {"sub" in card && card.sub && (
              <p className="mt-1 text-xs font-medium text-red-600">{card.sub}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">最近工單</h2>
          <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
            查看全部 →
          </Link>
        </div>
        {recentTickets.length === 0 ? (
          <p className="text-sm text-slate-500">尚無工單</p>
        ) : (
          <div className="space-y-3">
            {recentTickets.map((ticket) => {
              const stale = isTicketStale(ticket);
              return (
                <Link
                  key={ticket.id}
                  to={`/tickets/${ticket.id}`}
                  className={ticketRowClass(stale)}
                >
                  <div>
                    <p className="font-medium text-slate-900">{ticket.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ticket.asset.code} · <PriorityBadge priority={ticket.priority} />
                      {stale && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="text-red-600">
                            {formatStaleDuration(getStaleDurationMs(ticket))} 未更新
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {stale && (
                      <StaleBadge
                        durationLabel={formatStaleDuration(getStaleDurationMs(ticket))}
                      />
                    )}
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
