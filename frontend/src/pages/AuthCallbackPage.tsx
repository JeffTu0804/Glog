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
        const rawTarget = searchParams.get("target");
        const token = searchParams.get("access_token");
        if (!token) {
          setError("登入失敗，請重試");
          return;
        }

        if (rawTarget === "platform") {
          await setSessionFromToken("platform", token);
          try {
            await platformApi.getMe(token);
            navigate("/manager", { replace: true });
          } catch {
            navigate("/manager/apply?auto=1", { replace: true });
          }
          return;
        }

        // hotel / hotelAdmin 共用員工 JWT
        await setSessionFromToken("hotel", token);
        const status = await checkAuthStatus(token);
        if (status.registered) {
          await refreshProfile();
        }

        if (rawTarget === "hotelAdmin") {
          navigate("/admin", { replace: true });
          return;
        }

        navigate("/chat", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "登入處理失敗");
      }
    })();
  }, [navigate, refreshProfile, searchParams, setSessionFromToken]);

  if (error) {
    const rawTarget = searchParams.get("target");
    const backHref =
      rawTarget === "platform"
        ? "/manager/login"
        : rawTarget === "hotelAdmin"
          ? "/admin/login"
          : "/login";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <a href={backHref} className="text-indigo-600 hover:underline">
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
