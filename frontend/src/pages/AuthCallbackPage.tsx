import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { checkAuthStatus } from "../lib/auth";
import { platformApi } from "../lib/platformApi";
import { consumeAuthHashSession, getSupabaseClient } from "../lib/supabase";

/**
 * LINE / OAuth 登入回調。
 * 建立 session 後，飯店端一律導向 /home，未加入飯店者由 OnboardingGuard
 * 強制彈出首次登入問卷；平台端則導向 /manager。
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const target = searchParams.get("target") === "platform" ? "platform" : "hotel";
        const client = getSupabaseClient(target);

        let session = await consumeAuthHashSession(client);
        if (!session) {
          const { data, error: sessionError } = await client.auth.getSession();
          if (sessionError) throw sessionError;
          session = data.session;
        }

        const token = session?.access_token;
        if (!token) {
          setError("登入失敗，請重試");
          return;
        }

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
        }
        // 未加入飯店者也導向 /home，由 OnboardingGuard 攔截彈出首次登入問卷
        navigate("/home", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "登入處理失敗");
      }
    })();
  }, [navigate, refreshProfile, searchParams]);

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
