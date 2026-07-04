import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { checkAuthStatus, registerHotel } from "../lib/auth";
import { platformApi } from "../lib/platformApi";
import { supabase } from "../lib/supabase";

/**
 * LINE / OAuth 登入後，若尚未建立飯店資料，引導完成註冊。
 */
export function CompleteRegistrationPage() {
  const navigate = useNavigate();
  const { session, profile, loading, refreshProfile } = useAuth();
  const [hotelName, setHotelName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setEmail(session.user.email ?? "");
      const meta = session.user.user_metadata as { full_name?: string; name?: string };
      const name = meta.full_name ?? meta.name ?? "";
      if (name) setAdminName(name);
    }
  }, [session]);

  if (!loading && profile) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!loading && !session) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("登入已過期，請重新登入");

      await registerHotel(token, { hotelName, slug, adminName });
      await refreshProfile();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-slate-900">完成飯店設定</h1>
        <p className="mt-1 text-sm text-slate-500">
          您的 LINE / OAuth 帳號已驗證，請填寫飯店資訊
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <input
            placeholder="飯店名稱"
            value={hotelName}
            onChange={(e) => setHotelName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <input
            placeholder="飯店代碼（例：my-hotel）"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <input
            placeholder="您的姓名"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={email}
            disabled
            className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "建立中…" : "完成註冊"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshProfile, getToken } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        // 等待 Supabase 從 OAuth redirect URL 解析 session
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        let token = data.session?.access_token;

        if (!token) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 3000);
            const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
              if (session?.access_token) {
                clearTimeout(timeout);
                token = session.access_token;
                sub.subscription.unsubscribe();
                resolve();
              }
            });
          });
        }

        if (!token) {
          setError("登入失敗，請重試");
          return;
        }

        const target = searchParams.get("target") === "platform" ? "platform" : "hotel";
        if (target === "platform") {
          try {
            await platformApi.getMe(token);
            navigate("/manager", { replace: true });
            return;
          } catch {
            setError("此 LINE 帳號尚未具有 Manager 權限");
            return;
          }
        }

        const status = await checkAuthStatus(token);

        if (status.registered) {
          await refreshProfile();
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/register/complete", { replace: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "登入處理失敗");
      }
    })();
  }, [getToken, navigate, refreshProfile, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <a
          href={searchParams.get("target") === "platform" ? "/manager/login" : "/login"}
          className="text-indigo-600 hover:underline"
        >
          返回登入
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      登入處理中…
    </div>
  );
}
