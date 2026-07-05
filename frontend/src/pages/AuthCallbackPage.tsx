import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  checkAuthStatus,
  joinHotel,
  lookupTenantBySlug,
  registerHotel,
  type JoinableRole,
} from "../lib/auth";
import { getDefaultHomePath } from "../lib/homeRoute";
import { platformApi } from "../lib/platformApi";
import { consumeAuthHashSession, getSupabaseClient, hotelSupabase } from "../lib/supabase";

type OnboardingMode = "join" | "create";

const ROLE_OPTIONS: { value: JoinableRole; label: string; department: string }[] = [
  { value: "FRONT_DESK", label: "前台人員", department: "前台" },
  { value: "HOUSEKEEPING", label: "房務人員", department: "房務部" },
  { value: "ENGINEER", label: "工程師", department: "工程部" },
  { value: "FOOD_BEVERAGE", label: "餐飲人員", department: "餐飲部" },
];

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block text-sm font-medium text-slate-800">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * LINE / OAuth 登入後，若尚未加入飯店，引導填寫 onboarding（Google 表單風格）。
 */
export function CompleteRegistrationPage() {
  const navigate = useNavigate();
  const { hotelSession, profile, loading, refreshProfile } = useAuth();
  const [mode, setMode] = useState<OnboardingMode>("join");

  const [slug, setSlug] = useState("");
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "not_found">(
    "idle",
  );

  const [name, setName] = useState("");
  const [role, setRole] = useState<JoinableRole>("FRONT_DESK");

  const [hotelName, setHotelName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isLineUser =
    !!hotelSession?.user?.app_metadata?.provider ||
    !!(hotelSession?.user?.user_metadata as { provider?: string } | undefined)?.provider ||
    hotelSession?.user?.identities?.some((i) => i.provider === "line");

  useEffect(() => {
    if (hotelSession?.user) {
      setEmail(hotelSession.user.email ?? "");
      const meta = hotelSession.user.user_metadata as { full_name?: string; name?: string };
      const displayName = meta.full_name ?? meta.name ?? "";
      if (displayName) {
        setName(displayName);
        setAdminName(displayName);
      }
    }
  }, [hotelSession]);

  const runLookup = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setTenantName(null);
      setLookupState("idle");
      return;
    }

    setLookupState("loading");
    try {
      const { data } = await hotelSupabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const result = await lookupTenantBySlug(token, trimmed);
      if (result.found && result.tenant) {
        setTenantName(result.tenant.name);
        setLookupState("found");
      } else {
        setTenantName(null);
        setLookupState("not_found");
      }
    } catch {
      setTenantName(null);
      setLookupState("not_found");
    }
  }, []);

  useEffect(() => {
    if (mode !== "join") return;
    const timer = window.setTimeout(() => {
      void runLookup(slug);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [slug, mode, runLookup]);

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === role);

  if (!loading && profile) {
    return <Navigate to={getDefaultHomePath(profile.role)} replace />;
  }

  if (!loading && !hotelSession) {
    return <Navigate to="/login" replace />;
  }

  async function handleJoinSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (lookupState !== "found") {
        throw new Error("請輸入正確的飯店代碼並確認飯店名稱");
      }

      const { data } = await hotelSupabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("登入已過期，請重新登入");

      await joinHotel(token, { slug, name, role });
      await refreshProfile();
      navigate(getDefaultHomePath(role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { data } = await hotelSupabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("登入已過期，請重新登入");

      await registerHotel(token, { hotelName, slug, adminName });
      await refreshProfile();
      navigate("/guest-requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0ebf8] py-10 px-4">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b-4 border-violet-600 px-8 py-6">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">glog</p>
            <h1 className="mt-1 text-2xl font-normal text-slate-900">員工資料登記</h1>
            <p className="mt-2 text-sm text-slate-600">
              首次使用 LINE 登入請填寫所在飯店、部門與職位，以便 glog 官方 LINE
              助手將通知推播至正確人員。
            </p>
          </div>

          {isLineUser && (
            <div className="mx-8 mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              您已透過 LINE 登入，完成登記後即可接收工單與交班推播。
            </div>
          )}

          <div className="mx-8 mt-6 flex gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("join")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                mode === "join"
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              加入現有飯店
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                mode === "create"
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              建立新飯店（管理員）
            </button>
          </div>

          {mode === "join" ? (
            <form onSubmit={(e) => void handleJoinSubmit(e)} className="space-y-4 px-8 py-6">
              <FormField
                label="所在飯店"
                required
                hint="請向飯店管理員索取飯店代碼（例如 demo-hotel）"
              >
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="飯店代碼"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                {lookupState === "loading" && (
                  <p className="mt-2 text-xs text-slate-500">正在確認飯店…</p>
                )}
                {lookupState === "found" && tenantName && (
                  <p className="mt-2 text-xs text-emerald-700">✓ {tenantName}</p>
                )}
                {lookupState === "not_found" && slug.trim() && (
                  <p className="mt-2 text-xs text-red-600">找不到此飯店代碼，請向管理員確認</p>
                )}
              </FormField>

              <FormField label="您的姓名" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="請輸入姓名"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </FormField>

              <FormField label="部門與職位" required hint="通知將依部門推播至對應同事">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as JoinableRole)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.department} · {opt.label}
                    </option>
                  ))}
                </select>
                {selectedRole && (
                  <p className="mt-2 text-xs text-slate-500">
                    所屬部門：{selectedRole.department}
                  </p>
                )}
              </FormField>

              {email && (
                <FormField label="登入帳號">
                  <input
                    value={email}
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                  />
                </FormField>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || lookupState !== "found"}
                className="w-full rounded-lg bg-violet-600 py-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {submitting ? "提交中…" : "提交並進入系統"}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4 px-8 py-6">
              <FormField label="飯店名稱" required>
                <input
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="例：台北君悅飯店"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </FormField>

              <FormField
                label="飯店代碼"
                required
                hint="英文小寫與連字號，建立後無法輕易更改"
              >
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="例：taipei-grand"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </FormField>

              <FormField label="管理員姓名" required>
                <input
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </FormField>

              {email && (
                <FormField label="登入帳號">
                  <input
                    value={email}
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                  />
                </FormField>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-violet-600 py-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {submitting ? "建立中…" : "建立飯店並進入系統"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">
          必填項目標示 * · 資料僅用於內部通知路由，不會對外公開
        </p>
      </div>
    </div>
  );
}

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
          navigate("/", { replace: true });
        } else {
          navigate("/register/complete", { replace: true });
        }
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
