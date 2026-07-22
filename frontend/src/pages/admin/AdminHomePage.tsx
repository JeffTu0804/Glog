import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { POSITION_LEVEL_LABELS } from "../../lib/employeeLabels";
import type { UserPositionLevel } from "../../lib/employeeLabels";

const LINKS = [
  { to: "/admin/analytics", title: "營運報表", desc: "工單效率與 AI 營運簡報" },
  { to: "/admin/inventory", title: "庫存", desc: "本飯店庫存與低庫存警示" },
  { to: "/admin/costs", title: "成本", desc: "維修耗材與人工成本" },
  { to: "/admin/users", title: "員工", desc: "本飯店員工名冊" },
];

export function AdminHomePage() {
  const { profile } = useAuth();
  const positionLabel =
    POSITION_LEVEL_LABELS[(profile?.positionLevel as UserPositionLevel) ?? "STAFF"] ??
    profile?.positionLevel ??
    "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {profile?.name}，歡迎回來
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          你正在管理{" "}
          <span className="font-semibold text-violet-700">
            {profile?.tenantName ?? "本飯店"}
          </span>
          的營運資料（僅限此飯店，無法查看其他租戶）
        </p>
        <p className="mt-1 text-xs text-slate-400">
          職稱：{positionLabel}
          {profile?.tenantSlug ? ` · ${profile.tenantSlug}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="glog-card block p-5 transition hover:border-violet-200 hover:shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
          </Link>
        ))}
      </div>

      <p className="text-center text-sm text-slate-500">
        需要處理日常通報？{" "}
        <Link to="/chat" className="font-medium text-violet-600 hover:underline">
          前往員工中控台
        </Link>
      </p>
    </div>
  );
}
