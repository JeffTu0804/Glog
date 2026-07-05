import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ManagerAuthLayout,
  managerButtonClass,
  managerInputClass,
} from "../components/ManagerAuthLayout";
import { useAuth } from "../context/AuthContext";
import { platformApi } from "../lib/platformApi";
import { managerSupabase } from "../lib/supabase";

const AUTO_REQUEST_KEY = "glog-manager-apply-auto";
const PENDING_NAME_KEY = "glog-manager-apply-name";

export function ManagerApplyPage() {
  const { managerSession, getToken, isPlatformAdmin, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  if (!loading && isPlatformAdmin) {
    return <Navigate to="/manager" replace />;
  }

  const shouldAutoSubmit =
    searchParams.get("auto") === "1" ||
    (typeof window !== "undefined" && window.localStorage.getItem(AUTO_REQUEST_KEY) === "1");

  const submitAccessRequest = useCallback(async (displayName?: string) => {
    const token = await getToken();
    const result = await platformApi.requestManagerAccess(token, {
      name: displayName?.trim() || undefined,
    });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTO_REQUEST_KEY);
      window.localStorage.removeItem(PENDING_NAME_KEY);
    }
    setSuccess(result.message);
  }, [getToken]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedName = window.localStorage.getItem(PENDING_NAME_KEY);
    if (storedName && !name) {
      setName(storedName);
    }
  }, [name]);

  useEffect(() => {
    if (!managerSession) {
      return;
    }

    let active = true;

    async function bootstrapManagerRequest() {
      setBootstrapping(true);
      setError("");

      try {
        const token = await getToken();
        const { request } = await platformApi.getMyAccessRequest(token);
        if (!active) return;

        if (request?.role === "manager" || request?.managerAccessStatus === "approved") {
          setSuccess("此帳號已具有 Manager 權限，可直接使用 Manager 後台。");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(AUTO_REQUEST_KEY);
            window.localStorage.removeItem(PENDING_NAME_KEY);
          }
          return;
        }

        if (request?.managerAccessStatus === "pending") {
          setSuccess("你的 Manager 權限申請已送出，確認通知信已寄給管理者。");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(AUTO_REQUEST_KEY);
          }
          return;
        }

        if (shouldAutoSubmit) {
          const storedName =
            typeof window !== "undefined" ? window.localStorage.getItem(PENDING_NAME_KEY) : null;
          await submitAccessRequest(storedName || name || undefined);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "檢查申請狀態失敗");
      } finally {
        if (active) {
          setBootstrapping(false);
        }
      }
    }

    void bootstrapManagerRequest();

    return () => {
      active = false;
    };
  }, [getToken, name, managerSession, shouldAutoSubmit, submitAccessRequest]);

  async function handleExistingAccountRequest() {
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await submitAccessRequest(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出申請失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const { data, error: signUpError } = await managerSupabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
        },
      });
      if (signUpError) throw signUpError;
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("此 Email 已經註冊過，請直接登入後送出 Manager 申請，或改用其他 Email");
      }

      if (!data.user?.id || !data.user.email) {
        throw new Error("建立帳號成功，但暫時拿不到使用者資料，請稍後再試");
      }

      const result = await platformApi.requestManagerAccessAfterSignup({
        supabaseUserId: data.user.id,
        email: data.user.email,
        name: name.trim(),
      });

      if (data.session?.access_token) {
        setSuccess(result.message);
      } else {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(AUTO_REQUEST_KEY);
          window.localStorage.removeItem(PENDING_NAME_KEY);
        }
        setSuccess(
          `${result.message} 驗證信也已寄出；請完成 Email 驗證，之後管理者核准後即可登入 Manager。`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManagerAuthLayout
      title="申請 Manager 權限"
      subtitle="建立帳號或為現有帳號申請平台營運後台權限"
      breadcrumb="Manager 申請"
      footer={
        <div className="mt-6 text-center text-sm">
          <Link to="/manager/login" className="text-slate-500 hover:text-slate-900 hover:underline">
            返回 Manager 登入
          </Link>
        </div>
      }
    >
      {managerSession ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-700">
            {bootstrapping
              ? "正在檢查你的 Manager 申請狀態…"
              : "已登入目前帳號，可直接送出 Manager 權限申請。"}
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">顯示名稱（選填）</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={managerInputClass}
            />
          </div>
          <button
            type="button"
            disabled={submitting || bootstrapping}
            onClick={() => void handleExistingAccountRequest()}
            className={managerButtonClass}
          >
            {submitting ? "送出中…" : "送出 Manager 權限申請"}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSignup(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">姓名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={managerInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={managerInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={managerInputClass}
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

          <button type="submit" disabled={submitting} className={managerButtonClass}>
            {submitting ? "送出中…" : "建立帳號並申請 Manager 權限"}
          </button>
        </form>
      )}
    </ManagerAuthLayout>
  );
}
