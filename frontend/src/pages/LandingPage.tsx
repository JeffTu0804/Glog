import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingPage() {
  const { session, profile, isPlatformAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        載入中…
      </div>
    );
  }

  if (session && isPlatformAdmin && !profile) {
    return <Navigate to="/manager" replace />;
  }
  if (session && profile) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-2xl font-bold">glog</span>
        <Link
          to="/login"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/20"
        >
          飯店登入
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-indigo-300">
          Hotel Back-of-House ERP
        </p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          飯店後勤，一站管理
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
          工單派單、資產維護、耗材庫存、成本損益——專為飯店 BOH 設計的微型 SaaS。
          不碰訂房帳務，專注後勤效率。
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            to="/login"
            className="rounded-xl bg-indigo-500 px-8 py-3 font-medium text-white hover:bg-indigo-400"
          >
            飯店員工登入
          </Link>
          <Link
            to="/manager/login"
            className="rounded-xl border border-white/20 px-8 py-3 font-medium text-white hover:bg-white/10"
          >
            glog Manager
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur">
          <p className="text-sm font-medium text-indigo-300">雙入口架構</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-5">
              <h3 className="font-semibold text-white">glog 飯店系統</h3>
              <p className="mt-2 text-sm text-slate-300">
                給飯店員工使用，處理工單、交班、住客請求與 QR 管理。
              </p>
            </div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-5">
              <h3 className="font-semibold text-white">glog Manager</h3>
              <p className="mt-2 text-sm text-slate-300">
                給平台營運團隊使用，管理租戶、方案與平台功能設定。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-20 sm:grid-cols-3">
        {[
          {
            title: "智能工單",
            desc: "自動派單、工程師技能匹配、結案扣庫存與成本結算",
          },
          {
            title: "資產追蹤",
            desc: "客房與設備狀態即時掌握，延長資產壽命",
          },
          {
            title: "多租戶 SaaS",
            desc: "每家飯店資料嚴格隔離，平台統一營運管理",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
          >
            <h3 className="font-semibold text-indigo-200">{card.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{card.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        glog · 飯店後勤管理系統
      </footer>
    </div>
  );
}
