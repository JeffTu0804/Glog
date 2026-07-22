import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ManagerAuthLayout,
  managerButtonClass,
  managerInputClass,
  managerLinkClass,
} from "../components/ManagerAuthLayout";
import { AuthFooterLink, OAuthButtons } from "../components/OAuthButtons";
import { useAuth } from "../context/AuthContext";
import { signInWithLine } from "../lib/auth";
import type { LoginTarget } from "../types/auth";

interface LoginPageContentProps {
  target: LoginTarget;
  title: string;
  subtitle: string;
  forgotPasswordPath: string;
}

function LoginPageContent({
  target,
  title,
  subtitle,
  forgotPasswordPath,
}: LoginPageContentProps) {
  const { login, hotelSession, managerSession, isPlatformAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
    if (searchParams.get("reset") === "success") {
      setError("");
    }
  }, [searchParams]);

  if (!loading && target === "platform" && managerSession && isPlatformAdmin) {
    return <Navigate to="/manager" replace />;
  }
  if (!loading && target === "hotel" && hotelSession) {
    // 已加入者進中控台、未加入者由 OnboardingGuard 攔截問卷
    return <Navigate to="/chat" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const resolved = await login(email, password, target);
      navigate(resolved === "platform" ? "/manager" : "/");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "登入失敗";
      if (msg.includes("Invalid login credentials")) {
        setError("帳號或密碼錯誤");
      } else if (msg.includes("非平台管理員")) {
        if (target === "platform") {
          navigate("/manager/apply?auto=1", { replace: true });
          return;
        }
        setError("此帳號不是平台管理員，請切換到「飯店員工」登入");
      } else if (msg.includes("待審核")) {
        setError("你的 Manager 權限申請待審核中，請等現有管理員核准。");
      } else if (msg.includes("已被拒絕")) {
        setError("你的 Manager 權限申請已被拒絕，請聯絡現有管理員。");
      } else if (msg.includes("尚未在系統中註冊")) {
        setError("帳號已通過驗證，但尚未加入飯店，請先完成設定");
        navigate("/chat");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const emailPasswordForm = (
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
          className={
            target === "platform"
              ? managerInputClass
              : "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          }
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
          className={
            target === "platform"
              ? managerInputClass
              : "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          }
        />
        <div className="mt-2 text-right">
          <Link
            to={forgotPasswordPath}
            className={
              target === "platform"
                ? `text-xs ${managerLinkClass}`
                : "text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
            }
          >
            忘記密碼？
          </Link>
        </div>
      </div>

      {target === "hotel" && error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {searchParams.get("reset") === "success" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          密碼已更新，請使用新密碼登入。
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={
          target === "platform"
            ? managerButtonClass
            : "w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        }
      >
        {submitting ? "登入中…" : "登入"}
      </button>
    </form>
  );

  const formContent =
    target === "platform" ? (
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            try {
              signInWithLine("platform");
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
        {emailPasswordForm}
      </div>
    ) : (
      <>
        {emailPasswordForm}
        <OAuthButtons target="hotel" onError={setError} disabled={submitting} />
        <AuthFooterLink mode="login" />
      </>
    );

  const footerLinks =
    target === "hotel" ? (
      <div className="mt-6 text-center text-sm">
        <Link to="/manager/login" className="text-slate-500 hover:text-slate-900 hover:underline">
          平台營運團隊請前往 Manager 後台登入
        </Link>
      </div>
    ) : (
      <div className="mt-6 space-y-2 text-center text-sm">
        <Link to="/manager/apply" className={`block ${managerLinkClass}`}>
          申請 Manager 權限
        </Link>
        <Link to="/login" className="text-slate-500 hover:text-slate-900 hover:underline">
          返回飯店員工登入
        </Link>
      </div>
    );

  if (target === "platform") {
    return (
      <ManagerAuthLayout
        title="Manager 後台登入"
        subtitle="平台營運與租戶管理"
        breadcrumb="Manager 登入"
        footer={footerLinks}
      >
        {formContent}
      </ManagerAuthLayout>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">glog</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="mb-6 rounded-lg bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-700">
          {title}
        </div>

        {formContent}
        {footerLinks}
      </div>
    </div>
  );
}

export function LoginPage() {
  return (
    <LoginPageContent
      target="hotel"
      title="飯店員工登入"
      subtitle="飯店後勤管理系統"
      forgotPasswordPath="/forgot-password"
    />
  );
}

export function ManagerLoginPage() {
  return (
    <LoginPageContent
      target="platform"
      title="Manager 後台登入"
      subtitle="平台營運與租戶管理"
      forgotPasswordPath="/manager/forgot-password"
    />
  );
}
