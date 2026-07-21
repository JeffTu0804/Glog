import { useEffect, useState } from "react";

const DEPARTMENTS = [
  { value: "front_desk", label: "前台 Front Desk" },
  { value: "housekeeping", label: "房務 Housekeeping" },
  { value: "engineering", label: "工程 Engineering" },
  { value: "purchasing", label: "採購 Purchasing" },
  { value: "spa", label: "SPA" },
] as const;

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";
const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

declare global {
  interface Window {
    liff?: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      closeWindow: () => void;
    };
  }
}

/**
 * LINE LIFF — 員工首次綁定身分
 * 將 line_user_id 對應至 employees 表。
 */
export function LiffBindPage() {
  const [lineUserId, setLineUserId] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] =
    useState<(typeof DEPARTMENTS)[number]["value"]>("front_desk");
  const [status, setStatus] = useState<"loading" | "ready" | "done" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function boot() {
      try {
        if (!LIFF_ID) {
          // 開發模式：允許手動貼 line_user_id
          setStatus("ready");
          setMessage("開發模式：未設定 VITE_LIFF_ID，請手動填寫 LINE User ID。");
          return;
        }

        await new Promise<void>((resolve, reject) => {
          if (window.liff) {
            resolve();
            return;
          }
          const script = document.createElement("script");
          script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("LIFF SDK 載入失敗"));
          document.head.appendChild(script);
        });

        await window.liff!.init({ liffId: LIFF_ID });
        if (!window.liff!.isLoggedIn()) {
          window.liff!.login();
          return;
        }
        const profile = await window.liff!.getProfile();
        setLineUserId(profile.userId);
        setName(profile.displayName);
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "LIFF 初始化失敗");
      }
    }
    void boot();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/cross-dept/bind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, hotelId, name, department }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "綁定失敗");

      setStatus("done");
      setMessage("綁定成功！可關閉此視窗，回到 LINE 開始派工。");
      setTimeout(() => {
        try {
          window.liff?.closeWindow();
        } catch {
          /* ignore */
        }
      }, 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "綁定失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-semibold tracking-wide text-sky-300">glog</p>
        <h1 className="mt-2 text-2xl font-bold">Bind Identity</h1>
        <p className="mt-2 text-sm text-slate-300">
          綁定飯店與部門後，才能接收跨部門任務推播。
        </p>

        {status === "loading" && (
          <p className="mt-8 text-slate-400">正在取得 LINE 身分…</p>
        )}

        {(status === "ready" || status === "error") && (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-4">
            {!LIFF_ID && (
              <label className="block text-sm">
                <span className="text-slate-300">LINE User ID</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                  value={lineUserId}
                  onChange={(e) => setLineUserId(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-slate-300">Hotel ID</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
                placeholder="飯店識別碼"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-300">姓名</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-300">部門</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                value={department}
                onChange={(e) =>
                  setDepartment(
                    e.target.value as (typeof DEPARTMENTS)[number]["value"],
                  )
                }
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={submitting || !lineUserId}
              className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "綁定中…" : "完成綁定"}
            </button>
          </form>
        )}

        {status === "done" && (
          <p className="mt-8 rounded-xl bg-emerald-500/20 px-4 py-3 text-emerald-200">
            {message}
          </p>
        )}

        {message && status !== "done" && (
          <p className="mt-4 text-sm text-amber-200">{message}</p>
        )}
      </div>
    </div>
  );
}
