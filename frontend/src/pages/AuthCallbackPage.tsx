import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { checkAuthStatus } from "../lib/auth";
import { platformApi } from "../lib/platformApi";

/**
 * LINE / OAuth 登入回調。
 * 接收後端導回的 access_token（Mongo JWT）。
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshProfile, setSessionFromToken } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const target = searchParams.get("target") === "platform" ? "platform" : "hotel";
        const token = searchParams.get("access_token");
        if (!token) {
          setError("登入失敗，請重試");
          return;
        }

        await setSessionFromToken(target, token);

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
        navigate("/chat", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "登入處理失敗");
      }
    })();
  }, [navigate, refreshProfile, searchParams, setSessionFromToken]);

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
