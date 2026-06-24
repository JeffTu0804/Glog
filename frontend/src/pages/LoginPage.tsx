import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthFooterLink, OAuthButtons } from "../components/OAuthButtons";
import { useAuth, type LoginTarget } from "../context/AuthContext";

export function LoginPage() {
  const { login, session, isPlatformAdmin, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [target, setTarget] = useState<LoginTarget>("hotel");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  if (!loading && session) {
    if (isPlatformAdmin) return <Navigate to="/platform" replace />;
    if (profile) return <Navigate to="/dashboard" replace />;
    if (target === "hotel") return <Navigate to="/register/complete" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const resolved = await login(email, password, target);
      navigate(resolved === "platform" ? "/platform" : "/dashboard");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "登入失敗";
      if (msg.includes("Invalid login credentials")) {
        setError("帳號或密碼錯誤，請確認 Supabase 設定的密碼");
      } else if (msg.includes("Email not confirmed")) {
        setError("Email 尚未驗證，請到信箱點確認連結");
      } else if (msg.includes("非平台管理員")) {
        setError("此帳號不是平台管理員，請切換到「飯店員工」登入");
      } else if (msg.includes("尚未在系統中註冊")) {
        setError("帳號已通過驗證，但尚未建立飯店，請先完成註冊");
        navigate("/register/complete");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">glog</h1>
          <p className="mt-1 text-sm text-slate-500">飯店後勤管理系統</p>
        </div>

        <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTarget("hotel")}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              target === "hotel"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            飯店員工
          </button>
          <button
            type="button"
            onClick={() => setTarget("platform")}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              target === "platform"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            平台管理員
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              密碼
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "登入中…" : "登入"}
          </button>
        </form>

        {target === "hotel" && (
          <>
            <OAuthButtons onError={setError} disabled={submitting} />
            <AuthFooterLink mode="login" />
          </>
        )}
      </div>
    </div>
  );
}
