import { Department } from "@prisma/client";

export const ANALYTICS_DEPARTMENT_SLUGS = [
  "all",
  "front_desk",
  "housekeeping",
  "engineering",
  "fb",
] as const;

export type AnalyticsDepartmentSlug = (typeof ANALYTICS_DEPARTMENT_SLUGS)[number];

const SLUG_ALIASES: Record<string, AnalyticsDepartmentSlug> = {
  all: "all",
  front_desk: "front_desk",
  frontdesk: "front_desk",
  housekeeping: "housekeeping",
  engineering: "engineering",
  fb: "fb",
  food_beverage: "fb",
  f_and_b: "fb",
};

export const ANALYTICS_DEPARTMENT_LABELS: Record<AnalyticsDepartmentSlug, string> = {
  all: "全體部門",
  front_desk: "客務部",
  housekeeping: "房務部",
  engineering: "工務部",
  fb: "餐飲部",
};

/**
 * 防呆：未知或空值一律降級為 `all`；支援常見別名（food_beverage → fb）。
 */
export function parseAnalyticsDepartment(value: unknown): AnalyticsDepartmentSlug {
  if (typeof value !== "string") return "all";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "all";
  return SLUG_ALIASES[normalized] ?? "all";
}

export function analyticsDepartmentToPrisma(
  slug: AnalyticsDepartmentSlug,
): Department | null {
  switch (slug) {
    case "front_desk":
      return Department.FRONT_DESK;
    case "housekeeping":
      return Department.HOUSEKEEPING;
    case "engineering":
      return Department.ENGINEERING;
    case "fb":
      return Department.FOOD_BEVERAGE;
    default:
      return null;
  }
}
