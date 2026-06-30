import type { MaintenanceTicket, TicketStatus } from "../types/api";

/** 超過此時間未更新狀態即視為逾時（毫秒） */
export const TICKET_STALE_MS = 2 * 60 * 60 * 1000;

const STALE_STATUSES: TicketStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
];

type StaleTicketInput = Pick<MaintenanceTicket, "status"> & {
  updatedAt?: string;
};

/** 進行中工單是否已逾時（超過 2 小時未更新） */
export function isTicketStale(ticket: StaleTicketInput): boolean {
  if (!STALE_STATUSES.includes(ticket.status)) return false;
  if (!ticket.updatedAt) return false;
  return Date.now() - new Date(ticket.updatedAt).getTime() >= TICKET_STALE_MS;
}

export function getStaleDurationMs(ticket: StaleTicketInput): number {
  if (!ticket.updatedAt) return 0;
  return Math.max(0, Date.now() - new Date(ticket.updatedAt).getTime());
}

export function formatStaleDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} 小時 ${minutes} 分`;
  return `${minutes} 分`;
}

export function countStaleTickets(tickets: StaleTicketInput[]): number {
  return tickets.filter(isTicketStale).length;
}

export function ticketListItemClass(stale: boolean): string {
  const base =
    "block rounded-xl bg-white p-4 shadow-sm transition hover:ring-indigo-300";
  return stale
    ? `${base} ring-2 ring-red-500 hover:ring-red-600`
    : `${base} ring-1 ring-slate-200`;
}

export function ticketRowClass(stale: boolean): string {
  const base = "flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50";
  return stale
    ? `${base} border-red-300 bg-red-50/50 hover:bg-red-50`
    : `${base} border-slate-100`;
}
