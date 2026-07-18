/** 跨部門路由 — 共用型別與常數 */

export const CROSS_DEPT_DEPARTMENTS = [
  "front_desk",
  "housekeeping",
  "engineering",
  "purchasing",
  "spa",
] as const;

export type CrossDeptDepartment = (typeof CROSS_DEPT_DEPARTMENTS)[number];

export const CROSS_DEPT_STATUSES = [
  "pending",
  "processing",
  "completed",
  "delayed",
] as const;

export type CrossDeptTicketStatus = (typeof CROSS_DEPT_STATUSES)[number];

export const DEPT_LABELS: Record<CrossDeptDepartment, string> = {
  front_desk: "前台",
  housekeeping: "房務",
  engineering: "工程",
  purchasing: "採購",
  spa: "SPA",
};

export function isCrossDeptDepartment(value: string): value is CrossDeptDepartment {
  return (CROSS_DEPT_DEPARTMENTS as readonly string[]).includes(value);
}

export function parseDepartment(raw: string): CrossDeptDepartment | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, CrossDeptDepartment> = {
    front_desk: "front_desk",
    frontdesk: "front_desk",
    前台: "front_desk",
    客務: "front_desk",
    housekeeping: "housekeeping",
    房務: "housekeeping",
    engineering: "engineering",
    工程: "engineering",
    purchasing: "purchasing",
    採購: "purchasing",
    spa: "spa",
    spa部: "spa",
  };
  return aliases[key] ?? (isCrossDeptDepartment(key) ? key : null);
}
