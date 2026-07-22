import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ManagerAuthLayout,
  managerButtonClass,
  managerInputClass,
  managerLinkClass,
} from "../../components/ManagerAuthLayout";
import { useAuth } from "../../context/AuthContext";
import { signInWithLine } from "../../lib/auth";
import { isHotelAdmin } from "../../lib/hotelAdmin";

/**
 * 飯店 Admin 登入：版面對齊 Manager（LINE + Email／密碼），品牌為 glog Admin。
 */
export function AdminLoginPage() {
  const { hotelSession, profile, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
    if (searchParams.get("reset") === "success") setError("");
  }, [searchParams]);

  if (!loading && hotelSession && isHotelAdmin(profile)) {
    return <Navigate to="/admin" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password, "hotel");
      navigate("/admin", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "登入失敗";
      if (msg.includes("尚未在系統中註冊")) {
        setError("帳號已通過驗證，但尚未加入飯店，請先完成員工站設定");
      } else if (msg.includes("帳號或密碼")) {
        setError("帳號或密碼錯誤");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManagerAuthLayout
      brand="admin"
      title="Admin 後台登入"
      subtitle="本飯店營運與員工管理"
      breadcrumb="Admin 登入"
      footer={
        <div className="mt-6 space-y-2 text-center text-sm">
          <Link to="/login" className={`block ${managerLinkClass}`}>
            返回飯店員工登入
          </Link>
          <Link to="/manager/login" className="text-slate-500 hover:text-slate-900 hover:underline">
            平台 Manager 登入
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {!loading && hotelSession && profile && !isHotelAdmin(profile) && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            目前帳號職稱不是主管／經理，無法進入 Admin。請在員工問卷選擇「主管」或「經理」。
          </p>
        )}
        {searchParams.get("reset") === "success" && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            密碼已更新，請使用新密碼登入。
          </p>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            try {
              signInWithLine("hotelAdmin");
            } catch (err) {
              setError(err instanceof Error ? err.message : "LINE 登入失敗");
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] py-2.5 text-sm font-medium text-white hover:bg-[#05b34c] disabled:opacity-50"
        >
          使用 LINE 登入
        </button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-500">或使用 Email / 密碼</span>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={managerInputClass}
            />
          </div>
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              密碼
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={managerInputClass}
            />
            <div className="mt-2 text-right">
              <Link to="/forgot-password" className={`text-xs ${managerLinkClass}`}>
                忘記密碼？
              </Link>
            </div>
          </div>

          <button type="submit" disabled={submitting} className={managerButtonClass}>
            {submitting ? "登入中…" : "登入"}
          </button>
        </form>
      </div>
    </ManagerAuthLayout>
  );
}
