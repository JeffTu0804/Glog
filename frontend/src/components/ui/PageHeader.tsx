import type { ReactNode } from "react";

const ACCENT_COLORS = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
} as const;

type Accent = keyof typeof ACCENT_COLORS;

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  accent?: Accent;
  meta?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, accent = "blue", meta, action }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 gap-4">
        <div className={`glog-section-accent ${ACCENT_COLORS[accent]}`} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
          {meta && <div className="mt-3">{meta}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
