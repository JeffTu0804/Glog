import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ManagerAuthLayout,
  managerButtonClass,
  managerInputClass,
  managerLinkClass,
} from "../components/ManagerAuthLayout";
import { useAuth } from "../context/AuthContext";
import type { LoginTarget } from "../types/auth";
import { consumeAuthHashSession, getSupabaseClient } from "../lib/supabase";

interface ForgotPasswordPageProps {
  target: LoginTarget;
  title: string;
  subtitle: string;
}

interface ResetPasswordPageProps extends ForgotPasswordPageProps {}

function loginPath(target: LoginTarget) {
  return target === "platform" ? "/manager/login" : "/login";
}

function resetPath(target: LoginTarget) {
  return target === "platform" ? "/manager/reset-password" : "/reset-password";
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
      return <Navigate to="/dashboard" replace />;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const { error: resetError } = await getSupabaseClient(target).auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${resetPath(target)}?target=${target}`,
      });

      if (resetError) throw resetError;

      setSuccess("已寄出重設密碼信件，請到您的 Email 開啟連結。");
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
        {submitting ? "寄送中…" : "寄送重設信"}
      </button>
    </form>
  );

  const footer = (
    <div className="mt-6 text-center text-sm">
      <Link to={loginPath(target)} className="text-slate-500 hover:text-slate-900 hover:underline">
        返回登入
      </Link>
    </div>
  );

  if (target === "platform") {
    return (
      <ManagerAuthLayout
        title={title}
        subtitle={subtitle}
        breadcrumb="忘記密碼"
        footer={footer}
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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient(target);

    const timer = setTimeout(() => {
      if (active) {
        setLoadingSession(false);
        setError("重設連結無效或已過期，請重新申請忘記密碼。");
      }
    }, 3000);

    void (async () => {
      try {
        const hashSession = await consumeAuthHashSession(client);
        if (!active) return;
        if (hashSession) {
          clearTimeout(timer);
          setReady(true);
          setLoadingSession(false);
          return;
        }
      } catch (err) {
        if (!active) return;
        clearTimeout(timer);
        setLoadingSession(false);
        setError(err instanceof Error ? err.message : "重設連結無效");
        return;
      }

      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      if (sessionError) {
        clearTimeout(timer);
        setLoadingSession(false);
        setError(sessionError.message);
        return;
      }
      if (data.session) {
        clearTimeout(timer);
        setReady(true);
        setLoadingSession(false);
      }
    })();

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        clearTimeout(timer);
        setReady(true);
        setLoadingSession(false);
      }
    });

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, [target]);

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

    setSubmitting(true);
    try {
      const client = getSupabaseClient(target);
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;

      await client.auth.signOut();
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

  const bodyContent = loadingSession ? (
    <p className="text-center text-sm text-slate-500">正在驗證重設連結…</p>
  ) : !ready ? (
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
      <ManagerAuthLayout
        title={title}
        subtitle={subtitle}
        breadcrumb="重設密碼"
        footer={footer}
      >
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
    <ForgotPasswordPageContent
      target="hotel"
      title="忘記密碼"
      subtitle="飯店後勤管理系統"
    />
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
