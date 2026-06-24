import type { TicketPriority, TicketStatus } from "../types/api";

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "待派單",
  ASSIGNED: "已指派",
  IN_PROGRESS: "進行中",
  COMPLETED: "已完工",
  CLOSED: "已結案",
  CANCELLED: "已取消",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-red-100 text-red-800",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  URGENT: "緊急",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const colors: Record<TicketPriority, string> = {
    LOW: "text-slate-500",
    MEDIUM: "text-slate-700",
    HIGH: "text-orange-600",
    URGENT: "text-red-600 font-semibold",
  };

  return (
    <span className={`text-xs ${colors[priority]}`}>
      優先：{PRIORITY_LABELS[priority]}
    </span>
  );
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理員",
  FRONT_DESK: "前台",
  HOUSEKEEPING: "房務",
  ENGINEER: "工程師",
};
