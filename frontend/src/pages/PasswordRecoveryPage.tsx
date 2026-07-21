import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ManagerAuthLayout,
  managerButtonClass,
  managerInputClass,
  managerLinkClass,
} from "../components/ManagerAuthLayout";
import { useAuth } from "../context/AuthContext";
import { getDefaultHomePath } from "../lib/homeRoute";
import { getApiBase } from "../lib/session";
import type { LoginTarget } from "../types/auth";

interface ForgotPasswordPageProps {
  target: LoginTarget;
  title: string;
  subtitle: string;
}

interface ResetPasswordPageProps extends ForgotPasswordPageProps {}

function loginPath(target: LoginTarget) {
  return target === "platform" ? "/manager/login" : "/login";
}

function ForgotPasswordPageContent({
  target,
  title,
  subtitle,
}: ForgotPasswordPageProps) {
  const { hotelSession, managerSession, profile, isPlatformAdmin, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading) {
    if (target === "platform" && managerSession && isPlatformAdmin) {
      return <Navigate to="/manager" replace />;
    }
    if (target === "hotel" && hotelSession && profile) {
      return <Navigate to={getDefaultHomePath(profile.role)} replace />;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch(`${getApiBase()}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        resetUrl?: string | null;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "寄送失敗");

      if (body.resetUrl) {
        setSuccess(`重設連結已產生（開發模式）：${body.resetUrl}`);
      } else {
        setSuccess(body.message || "若 Email 存在，已產生重設連結");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "寄送失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const formContent = (
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

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
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
        {submitting ? "送出中…" : "寄送重設連結"}
      </button>
    </form>
  );

  const footer = (
    <div className="mt-6 text-center text-sm">
      <Link
        to={loginPath(target)}
        className={target === "platform" ? managerLinkClass : "text-indigo-600 hover:underline"}
      >
        返回登入
      </Link>
    </div>
  );

  if (target === "platform") {
    return (
      <ManagerAuthLayout title={title} subtitle={subtitle} breadcrumb="忘記密碼" footer={footer}>
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
        {footer}
      </div>
    </div>
  );
}

function ResetPasswordPageContent({
  target,
  title,
  subtitle,
}: ResetPasswordPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = searchParams.get("token") || "";
    setToken(t);
    if (!t) setError("重設連結無效或已過期，請重新申請忘記密碼。");
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("密碼至少需要 6 個字元");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    if (!token) {
      setError("重設連結無效或已過期，請重新申請忘記密碼。");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "重設密碼失敗");
      navigate(`${loginPath(target)}?reset=success`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "重設密碼失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <div className="mt-6 text-center text-sm">
      <Link to={loginPath(target)} className="text-slate-500 hover:text-slate-900 hover:underline">
        返回登入
      </Link>
    </div>
  );

  const bodyContent = !token ? (
    <div className="space-y-4">
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      <div className="text-center text-sm">
        <Link
          to={target === "platform" ? "/manager/forgot-password" : "/forgot-password"}
          className={target === "platform" ? managerLinkClass : "text-indigo-600 hover:underline"}
        >
          重新申請忘記密碼
        </Link>
      </div>
    </div>
  ) : (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          新密碼
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
      </div>
      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          確認新密碼
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className={
            target === "platform"
              ? managerInputClass
              : "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          }
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
        {submitting ? "更新中…" : "更新密碼"}
      </button>
    </form>
  );

  if (target === "platform") {
    return (
      <ManagerAuthLayout title={title} subtitle={subtitle} breadcrumb="重設密碼" footer={footer}>
        {bodyContent}
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
        {bodyContent}
        {footer}
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  return (
    <ForgotPasswordPageContent target="hotel" title="忘記密碼" subtitle="飯店後勤管理系統" />
  );
}

export function ManagerForgotPasswordPage() {
  return (
    <ForgotPasswordPageContent
      target="platform"
      title="Manager 忘記密碼"
      subtitle="平台營運與租戶管理"
    />
  );
}

export function ResetPasswordPage() {
  return (
    <ResetPasswordPageContent
      target="hotel"
      title="重新設定密碼"
      subtitle="飯店後勤管理系統"
    />
  );
}

export function ManagerResetPasswordPage() {
  return (
    <ResetPasswordPageContent
      target="platform"
      title="Manager 重新設定密碼"
      subtitle="平台營運與租戶管理"
    />
  );
}
