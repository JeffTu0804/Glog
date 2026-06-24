import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PriorityBadge, TicketStatusBadge } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { MaintenanceTicket } from "../types/api";

export function DashboardPage() {
  const { getToken, profile } = useAuth();
  const [openCount, setOpenCount] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalCost, setTotalCost] = useState("0");
  const [recentTickets, setRecentTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const [ticketsRes, inventoryRes, costsRes] = await Promise.all([
          api.getTickets(token),
          api.getInventory(token, { lowStock: true }),
          api.getCostLogs(token),
        ]);

        const tickets = ticketsRes.tickets;
        setTotalTickets(tickets.length);
        setOpenCount(
          tickets.filter((t) =>
            ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(t.status),
          ).length,
        );
        setRecentTickets(tickets.slice(0, 5));
        setLowStockCount(inventoryRes.items.length);

        const costSum = costsRes.costLogs.reduce(
          (sum, log) => sum + Number(log.amount),
          0,
        );
        setTotalCost(costSum.toLocaleString());
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

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "進行中工單", value: openCount, href: "/tickets", color: "text-amber-600" },
          { label: "工單總數", value: totalTickets, href: "/tickets", color: "text-indigo-600" },
          { label: "低庫存耗材", value: lowStockCount, href: "/inventory", color: "text-red-600" },
          { label: "累計成本 (NT$)", value: totalCost, href: "/costs", color: "text-emerald-600" },
        ].map((card) => (
          <Link
            key={card.label}
            to={card.href}
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
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
            {recentTickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{ticket.title}</p>
                  <p className="text-xs text-slate-500">
                    {ticket.asset.code} · <PriorityBadge priority={ticket.priority} />
                  </p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
