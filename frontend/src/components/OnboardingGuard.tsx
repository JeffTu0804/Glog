import { useCallback, useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { joinHotel, type JoinableRole, type PositionLevel } from "../lib/auth";
import { managerButtonClass, managerInputClass } from "./ManagerAuthLayout";

/** 下拉選單沿用 Manager 紫色 focus 樣式 */
const managerSelectClass = "glog-select w-full focus:border-violet-400 focus:ring-violet-100";

/**
 * 首次登入強制問卷（Onboarding Survey）攔截層。
 *
 * 流程：
 *  1. 登入後若「尚未加入任何飯店」（後端無 profile / User 紀錄）→ 阻斷後台渲染，
 *     強制彈出滿版問卷（不可關閉）
 *  2. 使用者填寫飯店、部門、姓名/職稱後，呼叫後端 POST /api/v1/auth/join
 *     （joinHotel），在 "User" 表建立員工紀錄
 *  3. 建立成功後該員工即出現在 Manager 後台的「員工」列表；前端重抓 profile 並放行後台
 *
 * 說明：Manager「員工」列表讀取的是後端 User 表（以 tenantId 過濾），
 * 因此必須透過 joinHotel API 寫入，直接寫 profiles 表不會出現在 Manager。
 */

/** 飯店選項 → 飯店代碼（slug）。需與後端實際存在的租戶代碼一致。 */
const HOTEL_OPTIONS: { label: string; slug: string }[] = [
  { label: "Demo 飯店", slug: "demo-hotel" },
  { label: "華勛飯店", slug: "hua-xun-hotel" },
];

/** 部門選項 → 對應可加入的角色（joinHotel 不接受 ADMIN／管理層） */
const DEPARTMENT_OPTIONS: { label: string; role: JoinableRole }[] = [
  { label: "客務部", role: "FRONT_DESK" },
  { label: "房務", role: "HOUSEKEEPING" },
  { label: "餐飲", role: "FOOD_BEVERAGE" },
  { label: "工程", role: "ENGINEER" },
];

/** 職稱選項 → 對應職級（positionLevel） */
const POSITION_OPTIONS: { label: string; value: PositionLevel }[] = [
  { label: "員工", value: "STAFF" },
  { label: "主管", value: "SUPERVISOR" },
  { label: "經理", value: "MANAGER" },
];

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { profile, getToken, refreshProfile } = useAuth();

  // 表單狀態
  const [hotelSlug, setHotelSlug] = useState("");
  const [role, setRole] = useState("");
  const [positionLevel, setPositionLevel] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (submitting) return; // 防重複點擊

      if (!hotelSlug || !role || !positionLevel || !name.trim()) {
        setSubmitError("請完整填寫所有欄位");
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        const token = await getToken("hotel");
        await joinHotel(token, {
          slug: hotelSlug,
          name: name.trim(),
          role: role as JoinableRole,
          positionLevel: positionLevel as PositionLevel,
        });

        // 重抓 profile：成功後 profile 就緒，攔截自動解除、放行後台
        await refreshProfile();
      } catch (err) {
        console.error("提交 onboarding 問卷失敗", err);
        setSubmitError(err instanceof Error ? err.message : "設定失敗，請稍後再試");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, hotelSlug, role, positionLevel, name, getToken, refreshProfile],
  );

  // 已加入飯店（後端已有員工資料）→ 放行後台
  if (profile) {
    return <>{children}</>;
  }

  // 尚未加入 → 滿版問卷 Modal（不可關閉），沿用 Manager 後台紫色風格
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="glog-card w-full max-w-lg p-8">
        {/* 標題區：Manager 風格紫色色條 + 標題 */}
        <div className="mb-6 flex items-start gap-4">
          <div className="glog-section-accent shrink-0 bg-violet-500" />
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium tracking-wide text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              首次登入設定
            </div>
            <h1 className="text-xl font-bold text-slate-900">歡迎加入 Glog</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              花 30 秒完成基本資料，即可開啟你的智慧工作台。
            </p>
          </div>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 所屬飯店 */}
          <div className="space-y-1.5">
            <label htmlFor="onboarding-hotel" className="block text-sm font-semibold text-slate-700">
              所屬飯店 <span className="text-rose-500">*</span>
            </label>
            <select
              id="onboarding-hotel"
              className={managerSelectClass}
              value={hotelSlug}
              onChange={(e) => setHotelSlug(e.target.value)}
              disabled={submitting}
              required
            >
              <option value="" disabled>
                請選擇飯店
              </option>
              {HOTEL_OPTIONS.map((h) => (
                <option key={h.slug} value={h.slug}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          {/* 所屬部門 */}
          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-department"
              className="block text-sm font-semibold text-slate-700"
            >
              所屬部門 <span className="text-rose-500">*</span>
            </label>
            <select
              id="onboarding-department"
              className={managerSelectClass}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={submitting}
              required
            >
              <option value="" disabled>
                請選擇部門
              </option>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d.role} value={d.role}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* 職稱 */}
          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-position"
              className="block text-sm font-semibold text-slate-700"
            >
              職稱 <span className="text-rose-500">*</span>
            </label>
            <select
              id="onboarding-position"
              className={managerSelectClass}
              value={positionLevel}
              onChange={(e) => setPositionLevel(e.target.value)}
              disabled={submitting}
              required
            >
              <option value="" disabled>
                請選擇職稱
              </option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* 姓名 */}
          <div className="space-y-1.5">
            <label htmlFor="onboarding-name" className="block text-sm font-semibold text-slate-700">
              您的姓名 <span className="text-rose-500">*</span>
            </label>
            <input
              id="onboarding-name"
              type="text"
              className={managerInputClass}
              placeholder="例如：王小明 / 值班經理"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          {submitError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            className={`${managerButtonClass} py-3 text-base`}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                設定中…
              </>
            ) : (
              "完成設定，開啟 Glog 小幫手"
            )}
          </button>

          <p className="text-center text-xs text-slate-400">
            此設定為必填，完成後才能進入系統。
          </p>
        </form>
      </div>
    </div>
  );
}
