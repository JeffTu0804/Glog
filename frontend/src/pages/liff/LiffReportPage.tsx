import { useEffect, useState } from "react";
import type { Department } from "../../types/api";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";
const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

const DEPARTMENTS: { id: Department; label: string }[] = [
  { id: "ENGINEERING", label: "工程部" },
  { id: "HOUSEKEEPING", label: "房務部" },
  { id: "FRONT_DESK", label: "客務部" },
  { id: "FOOD_BEVERAGE", label: "餐飲部" },
];

interface StaffInfo {
  name: string;
  department: Department;
  departmentLabel: string;
  hotelName: string;
}

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

async function loadLiffSdk(): Promise<void> {
  if (window.liff) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("LIFF SDK 載入失敗"));
    document.head.appendChild(script);
  });
}

/**
 * LINE LIFF — 第一線員工行動通報（任務／知會）
 * 以 lineUserId 反查 User，建立 HotelNotice（與網站「新增事件」同源）。
 */
export function LiffReportPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [lineUserId, setLineUserId] = useState("");

  const [targetDepartment, setTargetDepartment] =
    useState<Department>("ENGINEERING");
  const [eventType, setEventType] = useState<"TASK" | "MEMO">("TASK");
  const [roomNumber, setRoomNumber] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function initLiffAndAuth() {
      try {
        let userId = "";

        if (!LIFF_ID) {
          // 開發模式：允許手動貼 line_user_id
          setLoading(false);
          setError(null);
          return;
        }

        await loadLiffSdk();
        await window.liff!.init({ liffId: LIFF_ID });

        if (!window.liff!.isLoggedIn()) {
          window.liff!.login();
          return;
        }

        const profile = await window.liff!.getProfile();
        userId = profile.userId;
        setLineUserId(userId);

        const res = await fetch(
          `${API_BASE}/api/v1/liff/staff?lineUserId=${encodeURIComponent(userId)}`,
        );
        const data = (await res.json()) as {
          staff?: StaffInfo;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(
            data.error ?? data.message ?? "未能驗證員工身分",
          );
        }
        if (!data.staff) {
          throw new Error(
            "未能在系統中找到您的員工身份，請先以 LINE 登入完成綁定。",
          );
        }

        setStaff(data.staff);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "LIFF 初始化或身份驗證失敗",
        );
      } finally {
        setLoading(false);
      }
    }

    void initLiffAndAuth();
  }, []);

  async function resolveDevStaff() {
    if (!lineUserId.trim()) {
      setError("請填寫 LINE User ID");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/liff/staff?lineUserId=${encodeURIComponent(lineUserId.trim())}`,
      );
      const data = (await res.json()) as {
        staff?: StaffInfo;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? "查詢失敗");
      }
      if (!data.staff) throw new Error("找不到員工");
      setStaff(data.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staff || !description.trim() || !lineUserId.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/liff/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: lineUserId.trim(),
          type: eventType,
          description: description.trim(),
          roomNumber: roomNumber.trim() || undefined,
          targetDepartment:
            eventType === "TASK" ? targetDepartment : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? "送出失敗");
      }

      try {
        window.liff?.closeWindow();
      } catch {
        alert("送出成功！可關閉此視窗返回 LINE。");
      }
    } catch (err) {
      alert(
        `送出失敗，請重試。${err instanceof Error ? err.message : ""}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-slate-50 p-6 animate-pulse">
        <div className="space-y-6">
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="space-y-3">
            <div className="h-4 w-1/4 rounded bg-slate-200" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-14 rounded-xl bg-slate-200" />
              <div className="h-14 rounded-xl bg-slate-200" />
            </div>
          </div>
          <div className="h-28 rounded-xl bg-slate-200" />
        </div>
        <div className="h-14 w-full rounded-xl bg-slate-200" />
      </div>
    );
  }

  // 開發模式：尚未設定 LIFF，先手動輸入 lineUserId
  if (!LIFF_ID && !staff) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-slate-50 p-6">
        <div className="mx-auto w-full max-w-md space-y-4">
          <p className="text-xs font-semibold tracking-wide text-slate-400">
            glog · 開發模式
          </p>
          <h1 className="text-lg font-bold text-slate-800">行動通報</h1>
          <p className="text-sm text-slate-500">
            未設定 VITE_LIFF_ID，請貼上已綁定的 LINE User ID 測試。
          </p>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium"
            placeholder="Uxxxxxxxx..."
            value={lineUserId}
            onChange={(e) => setLineUserId(e.target.value)}
          />
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void resolveDevStaff()}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white"
          >
            繼續
          </button>
        </div>
      </div>
    );
  }

  if (error && !staff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <h3 className="mb-2 text-lg font-bold text-slate-800">權限驗證失敗</h3>
        <p className="max-w-xs text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 p-4 pb-8 antialiased">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-1 flex-col justify-between space-y-5"
      >
        <div className="space-y-5">
          <div className="rounded-xl bg-slate-100 p-3 text-center">
            <p className="text-xs font-medium text-slate-500">
              您好，
              <span className="font-bold text-slate-800">{staff?.name}</span>
              {" "}
              ({staff?.departmentLabel})
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              正在為{" "}
              <span className="font-semibold">{staff?.hotelName}</span>{" "}
              建立即時事件
            </p>
          </div>

          {eventType === "TASK" && (
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700">
                目標部門 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {DEPARTMENTS.map((dept) => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setTargetDepartment(dept.id)}
                    className={`rounded-xl border px-4 py-3.5 text-sm font-bold transition-all ${
                      targetDepartment === dept.id
                        ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-100"
                        : "border-slate-200 bg-white text-slate-600 active:bg-slate-50"
                    }`}
                  >
                    {dept.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700">
              事件類型 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
              <button
                type="button"
                onClick={() => setEventType("TASK")}
                className={`flex items-center justify-center rounded-lg py-2.5 text-sm font-bold transition-all ${
                  eventType === "TASK"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-600 active:bg-slate-300/50"
                }`}
              >
                需處理工單
              </button>
              <button
                type="button"
                onClick={() => setEventType("MEMO")}
                className={`flex items-center justify-center rounded-lg py-2.5 text-sm font-bold transition-all ${
                  eventType === "MEMO"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-600 active:bg-slate-300/50"
                }`}
              >
                純知會照會
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700">
              房號 / 地點
            </label>
            <input
              type="text"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="例：102 或 大廳廁所"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium transition-all placeholder:text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700">
              內容說明 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                eventType === "TASK"
                  ? "請輸入需要派工處理的詳細狀況..."
                  : "請輸入需要讓其他部門知曉的備忘訊息..."
              }
              rows={4}
              required
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium transition-all placeholder:text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="pt-6">
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className={`w-full rounded-xl py-4 text-base font-bold text-white shadow-lg transition-all ${
              submitting || !description.trim()
                ? "cursor-not-allowed bg-slate-300 shadow-none"
                : eventType === "TASK"
                  ? "bg-blue-600 shadow-blue-200 active:scale-[0.99] hover:bg-blue-700"
                  : "bg-emerald-600 shadow-emerald-200 active:scale-[0.99] hover:bg-emerald-700"
            }`}
          >
            {submitting ? "正在同步送出..." : "確認送出並關閉"}
          </button>
        </div>
      </form>
    </div>
  );
}
