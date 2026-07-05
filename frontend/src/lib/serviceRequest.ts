import type { Department } from "../types/api";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  FRONT_DESK: "前台",
  FOOD_BEVERAGE: "餐飲部",
  HOUSEKEEPING: "房務部",
  ENGINEERING: "工程部",
  MANAGEMENT: "管理層",
};

export const REQUEST_STATUS_LABELS = {
  PENDING: "待接單",
  CONFIRMED: "進行中",
  REJECTED: "已拒絕",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
} as const;

export const RESTAURANT_STATUS_LABELS = {
  PENDING: "待處理",
  CONFIRMED: "已確認",
  REJECTED: "已拒絕",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
} as const;

export function isRestaurantRequest(req: { type: string }) {
  return req.type === "RESTAURANT_RESERVATION";
}

export function isDepartmentTask(req: { type: string }) {
  return req.type === "GENERAL";
}

/** 將 datetime-local 值轉 ISO（視為台北時間輸入） */
export function localDatetimeToIso(value: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

/** 明天中午 12:00 的 datetime-local 預設值（台北） */
export function defaultTomorrowNoonLocal(): string {
  const now = new Date();
  const taipei = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }),
  );
  taipei.setDate(taipei.getDate() + 1);
  taipei.setHours(12, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${taipei.getFullYear()}-${pad(taipei.getMonth() + 1)}-${pad(taipei.getDate())}T12:00`;
}

/** 預約前 30 分鐘 */
export function reminderBeforeScheduled(scheduledLocal: string): string {
  if (!scheduledLocal) return "";
  const d = new Date(scheduledLocal);
  d.setMinutes(d.getMinutes() - 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
