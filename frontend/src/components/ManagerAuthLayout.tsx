import { Link } from "react-router-dom";

interface ManagerAuthLayoutProps {
  title: string;
  subtitle?: string;
  breadcrumb: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ManagerAuthLayout({
  title,
  subtitle,
  breadcrumb,
  children,
  footer,
}: ManagerAuthLayoutProps) {
  return (
    <div className="min-h-screen bg-violet-50/80">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link to="/manager/login" className="text-xl font-bold text-slate-900">
            glog <span className="text-violet-600">Manager</span>
          </Link>
        </div>
        <div className="mx-auto max-w-lg px-4 pb-3 text-sm text-slate-500">
          <Link to="/" className="hover:text-violet-600">
            首頁
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="text-slate-700">{breadcrumb}</span>
        </div>
      </header>
      <main className="flex justify-center px-4 py-8">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-6 flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100">
              <svg
                className="h-5 w-5 text-violet-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}

export const managerInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100";

export const managerButtonClass =
  "w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50";

export const managerLinkClass = "text-violet-600 hover:text-violet-700 hover:underline";
