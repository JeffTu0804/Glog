import type { TicketPriority, TicketStatus } from "../types/api";
import { SKILL_LABELS } from "../lib/engineeringTickets";

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "待派單",
  ASSIGNED: "已指派",
  IN_PROGRESS: "進行中",
  PENDING_FRONT_DESK: "待前台協助",
  COMPLETED: "已完工",
  CLOSED: "已結案",
  CANCELLED: "已取消",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  PENDING_FRONT_DESK: "bg-orange-100 text-orange-800",
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

export function SkillBadges({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {skills.map((skill) => (
        <span
          key={skill}
          className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
        >
          {SKILL_LABELS[skill] ?? skill}
        </span>
      ))}
    </span>
  );
}

export function StaleBadge({ durationLabel }: { durationLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
      <span aria-hidden>⚠</span>
      逾時 {durationLabel}
    </span>
  );
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理員",
  FRONT_DESK: "前台",
  HOUSEKEEPING: "房務",
  ENGINEER: "工程師",
  FOOD_BEVERAGE: "餐飲部",
};
