import type { Department } from "../types/api";
import type { RoutingDecision, RoutingUrgency } from "../types/api";

export const ROUTING_SLUG_OPTIONS: {
  slug: string;
  department: Department;
  label: string;
}[] = [
  { slug: "front_desk", department: "FRONT_DESK", label: "前台" },
  { slug: "housekeeping", department: "HOUSEKEEPING", label: "房務部" },
  { slug: "engineering", department: "ENGINEERING", label: "工程部" },
  { slug: "fb", department: "FOOD_BEVERAGE", label: "餐飲部" },
];

export function departmentToRoutingSlug(department: Department): string {
  return ROUTING_SLUG_OPTIONS.find((o) => o.department === department)?.slug ?? "front_desk";
}

export function slugsToDepartments(slugs: string[]): Department[] {
  return slugs
    .map((slug) => ROUTING_SLUG_OPTIONS.find((o) => o.slug === slug)?.department)
    .filter((d): d is Department => Boolean(d));
}

export function buildRoutingDecision(params: {
  visibility: "internal" | "shared";
  sharedSlugs: string[];
  reason: string;
  urgency: RoutingUrgency;
}): RoutingDecision {
  return {
    visibility: params.visibility,
    shared_with: params.visibility === "shared" ? params.sharedSlugs : [],
    reason: params.reason,
    urgency: params.urgency,
  };
}

export const URGENCY_LABELS: Record<RoutingUrgency, string> = {
  low: "低",
  medium: "中",
  high: "高",
};
