import { Department, LogEntryUrgency, LogEntryVisibility } from "@prisma/client";
import type { RoutingDecision } from "../types/lineWebhook.js";

/** LLM shared_with 部門 slug → Prisma Department */
export const ROUTING_DEPARTMENT_SLUGS: Record<string, Department> = {
  front_desk: Department.FRONT_DESK,
  housekeeping: Department.HOUSEKEEPING,
  engineering: Department.ENGINEERING,
  fb: Department.FOOD_BEVERAGE,
  food_beverage: Department.FOOD_BEVERAGE,
  management: Department.MANAGEMENT,
};

const DEFAULT_ROUTING: RoutingDecision = {
  visibility: "internal",
  shared_with: [],
  reason: "部門內部紀錄",
  urgency: "low",
};

export function parseRoutingDepartmentSlugs(slugs: unknown): Department[] {
  if (!Array.isArray(slugs)) return [];

  const departments: Department[] = [];
  for (const slug of slugs) {
    if (typeof slug !== "string") continue;
    const dept = ROUTING_DEPARTMENT_SLUGS[slug.trim().toLowerCase()];
    if (dept && !departments.includes(dept)) {
      departments.push(dept);
    }
  }
  return departments;
}

export function normalizeRoutingDecision(raw: unknown): RoutingDecision {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_ROUTING };
  }

  const obj = raw as Record<string, unknown>;
  const visibility = obj.visibility === "shared" ? "shared" : "internal";
  const shared_with = parseRoutingDepartmentSlugs(obj.shared_with).map((dept) =>
    departmentToSlug(dept),
  );
  const reason =
    typeof obj.reason === "string" && obj.reason.trim()
      ? obj.reason.trim()
      : DEFAULT_ROUTING.reason;
  const urgency =
    obj.urgency === "high" || obj.urgency === "medium" ? obj.urgency : "low";

  if (visibility === "shared" && shared_with.length === 0) {
    return {
      visibility: "internal",
      shared_with: [],
      reason: reason || "未指定同步部門，改為內部紀錄",
      urgency,
    };
  }

  return { visibility, shared_with, reason, urgency };
}

export function departmentToSlug(department: Department): string {
  switch (department) {
    case Department.FRONT_DESK:
      return "front_desk";
    case Department.HOUSEKEEPING:
      return "housekeeping";
    case Department.ENGINEERING:
      return "engineering";
    case Department.FOOD_BEVERAGE:
      return "fb";
    case Department.MANAGEMENT:
      return "management";
  }
}

/** 解析最終應寫入的部門看版（含來源部門） */
export function resolveRoutedDepartments(
  sourceDepartment: Department,
  routing: RoutingDecision,
): Department[] {
  const targets = new Set<Department>([sourceDepartment]);

  if (routing.visibility === "shared") {
    for (const slug of routing.shared_with) {
      const dept = ROUTING_DEPARTMENT_SLUGS[slug];
      if (dept) targets.add(dept);
    }
  }

  return [...targets];
}

/** OpenAI 未回傳 routing 時的規則降級 */
export function inferRoutingFromText(
  text: string,
  sourceDepartment: Department,
): RoutingDecision {
  const t = text.toLowerCase();
  const shared = new Set<Department>();
  let urgency: RoutingDecision["urgency"] = "low";
  const reasons: string[] = [];

  const damagePattern =
    /損壞|壞了|漏水|故障|維修|冷氣|馬桶|跳電|oo|out of order|complaint|客訴|投訴|vip|怒|生氣/;
  const housingPattern = /退房|住房|續住|換房|房態|滿房|no show/;
  const crossDeptPattern = /請.*部|通知.*部|協助|派工/;

  if (damagePattern.test(t)) {
    shared.add(Department.ENGINEERING);
    reasons.push("涉及房間設備或客訴");
    urgency = /客訴|投訴|vip|怒|生氣|緊急/.test(t) ? "high" : "medium";
  }

  if (/客訴|投訴|vip|客人反應|客人很/.test(t)) {
    shared.add(Department.FRONT_DESK);
    reasons.push("需客務部跟進客人");
    urgency = "high";
  }

  if (/清潔|房務|枕頭|毛巾|備品/.test(t)) {
    shared.add(Department.HOUSEKEEPING);
    reasons.push("涉及房務需求");
  }

  if (/餐廳|早餐|預約|用餐|fb|餐飲/.test(t)) {
    shared.add(Department.FOOD_BEVERAGE);
    reasons.push("涉及餐飲服務");
  }

  if (housingPattern.test(t)) {
    shared.add(Department.FRONT_DESK);
    shared.add(Department.HOUSEKEEPING);
    reasons.push("影響住房狀態");
    urgency = urgency === "low" ? "medium" : urgency;
  }

  if (crossDeptPattern.test(t)) {
    reasons.push("跨部門協作");
  }

  const internalOnlyPattern =
    /盤點|排班|巡檢|庶務|例行事項|無異常|正常$/;

  if (internalOnlyPattern.test(t) && shared.size === 0) {
    return { ...DEFAULT_ROUTING };
  }

  shared.delete(sourceDepartment);

  if (shared.size === 0) {
    return { ...DEFAULT_ROUTING };
  }

  return {
    visibility: "shared",
    shared_with: [...shared].map(departmentToSlug),
    reason: reasons.join("；") || "跨部門事項需同步",
    urgency,
  };
}

export function routingToDbFields(
  routing: RoutingDecision,
  sourceDepartment: Department,
) {
  return {
    visibility:
      routing.visibility === "shared"
        ? LogEntryVisibility.SHARED
        : LogEntryVisibility.INTERNAL,
    sharedWith: parseRoutingDepartmentSlugs(routing.shared_with),
    routingReason: routing.reason,
    urgency:
      routing.urgency === "high"
        ? LogEntryUrgency.HIGH
        : routing.urgency === "medium"
          ? LogEntryUrgency.MEDIUM
          : LogEntryUrgency.LOW,
    sourceDepartment,
  };
}
