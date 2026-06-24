const PLAN_LABELS: Record<string, string> = {
  TRIAL: "試用",
  STARTER: "入門",
  PRO: "專業",
  ENTERPRISE: "企業",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "使用中",
  TRIAL: "試用中",
  PAST_DUE: "逾期",
  SUSPENDED: "已暫停",
  CANCELLED: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/20 text-emerald-300",
  TRIAL: "bg-blue-500/20 text-blue-300",
  PAST_DUE: "bg-amber-500/20 text-amber-300",
  SUSPENDED: "bg-red-500/20 text-red-300",
  CANCELLED: "bg-slate-500/20 text-slate-400",
};

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-300">
      {PLAN_LABELS[plan] ?? plan}
    </span>
  );
}

export function SubscriptionBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-700 text-slate-300"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export { PLAN_LABELS, STATUS_LABELS };
