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
  ACTIVE: "bg-emerald-100 text-emerald-700",
  TRIAL: "bg-blue-100 text-blue-700",
  PAST_DUE: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
      {PLAN_LABELS[plan] ?? plan}
    </span>
  );
}

export function SubscriptionBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export { PLAN_LABELS, STATUS_LABELS };
