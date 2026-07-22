import { Link } from "react-router-dom";

export type AuthBrand = "manager" | "admin";

interface ManagerAuthLayoutProps {
  title: string;
  subtitle?: string;
  breadcrumb: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 預設 manager；admin 顯示 glog Admin / A */
  brand?: AuthBrand;
}

const BRAND = {
  manager: {
    letter: "M",
    label: "Manager",
    href: "/manager/login",
  },
  admin: {
    letter: "A",
    label: "Admin",
    href: "/admin/login",
  },
} as const;

export function ManagerAuthLayout({
  title,
  subtitle,
  breadcrumb,
  children,
  footer,
  brand = "manager",
}: ManagerAuthLayoutProps) {
  const b = BRAND[brand];

  return (
    <div className="min-h-screen bg-[var(--color-glog-bg)]">
      <header className="border-b border-slate-200/60 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-sm font-bold text-white shadow-sm">
            {b.letter}
          </span>
          <Link to={b.href} className="text-lg font-bold text-slate-900">
            glog <span className="text-violet-600">{b.label}</span>
          </Link>
        </div>
        <div className="mx-auto max-w-lg px-4 pb-3 text-sm text-slate-500">
          <Link to="/" className="hover:text-violet-600">
            首頁
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="font-medium text-slate-700">{breadcrumb}</span>
        </div>
      </header>
      <main className="flex justify-center px-4 py-8">
        <div className="glog-card w-full max-w-lg p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="glog-section-accent shrink-0 bg-violet-500" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}

export const managerInputClass = "glog-input focus:border-violet-400 focus:ring-violet-100";

export const managerButtonClass =
  "glog-btn-manager w-full disabled:opacity-50";

export const managerLinkClass = "font-medium text-violet-600 hover:text-violet-700 hover:underline";
