import {
  Department,
  ServiceRequestType,
  UserRole,
} from "@prisma/client";
import type { LineIntentPersistResult, LineSemanticParseResult } from "../types/lineWebhook.js";
import { roleToDepartment } from "../utils/department.js";
import { createDepartmentTaskFromLine } from "./departmentTaskService.js";
import { createImmediateDepartmentReminder } from "./reminderService.js";
import { createServiceRequest } from "./serviceRequestService.js";
import { prisma } from "../lib/prisma.js";

function parseEventTime(timeStr: string): Date {
  const trimmed = timeStr.trim();
  if (trimmed) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
  return fallback;
}

function mapAlertDepartment(level: "high" | "medium"): Department {
  return level === "high" ? Department.MANAGEMENT : Department.FRONT_DESK;
}

export async function persistLineSemanticIntents(params: {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  triggeredByName: string;
  parsed: LineSemanticParseResult;
  sourceText: string;
}): Promise<LineIntentPersistResult> {
  const result: LineIntentPersistResult = {
    tasks: [],
    alerts: [],
    events: [],
    errors: [],
  };

  const { tenantId, userId, userRole, triggeredByName, parsed, sourceText } = params;

  if (parsed.has_task && parsed.task_data) {
    try {
      const msg = await persistTaskIntent({
        tenantId,
        userId,
        userRole,
        triggeredByName,
        task: parsed.task_data,
        sourceText,
      });
      if (msg) result.tasks.push(msg);
    } catch (err) {
      result.errors.push(
        `任務建立失敗：${err instanceof Error ? err.message : "未知錯誤"}`,
      );
    }
  }

  if (parsed.has_alert && parsed.alert_data) {
    try {
      const msg = await persistAlertIntent({
        tenantId,
        alert: parsed.alert_data,
        sourceText,
      });
      if (msg) result.alerts.push(msg);
    } catch (err) {
      result.errors.push(
        `警示建立失敗：${err instanceof Error ? err.message : "未知錯誤"}`,
      );
    }
  }

  if (parsed.has_event && parsed.event_data) {
    try {
      const msg = await persistEventIntent({
        tenantId,
        userId,
        userRole,
        event: parsed.event_data,
        sourceText,
      });
      if (msg) result.events.push(msg);
    } catch (err) {
      result.errors.push(
        `行程建立失敗：${err instanceof Error ? err.message : "未知錯誤"}`,
      );
    }
  }

  return result;
}

async function persistTaskIntent(params: {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  triggeredByName: string;
  task: NonNullable<LineSemanticParseResult["task_data"]>;
  sourceText: string;
}): Promise<string | null> {
  const { tenantId, userId, userRole, triggeredByName, task } = params;
  const roomCode = task.room_number.trim();

  if (!roomCode) {
    throw new Error("請提供房號");
  }

  const title =
    task.description.slice(0, 100) ||
    `${roomCode} ${task.category}任務`;

  return createDepartmentTaskFromLine({
    tenantId,
    userId,
    userRole,
    triggeredByName,
    roomNumber: roomCode,
    category: task.category,
    title,
    description: params.sourceText,
  });
}

async function persistAlertIntent(params: {
  tenantId: string;
  alert: NonNullable<LineSemanticParseResult["alert_data"]>;
  sourceText: string;
}): Promise<string> {
  const { tenantId, alert } = params;
  const dept = mapAlertDepartment(alert.level);
  const roomLabel = alert.room_number ? `${alert.room_number} 號房` : "未指定房號";
  const levelLabel = alert.level === "high" ? "高" : "中";

  await prisma.$transaction(async (tx) => {
    await createImmediateDepartmentReminder(tx, {
      tenantId,
      title: `客訴警示（${levelLabel}）：${roomLabel}`,
      message: alert.description || params.sourceText,
      notifyDepartment: dept,
    });
  });

  return `客訴警示：${roomLabel}（${levelLabel}優先）`;
}

async function persistEventIntent(params: {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  event: NonNullable<LineSemanticParseResult["event_data"]>;
  sourceText: string;
}): Promise<string> {
  const { tenantId, userId, userRole, event } = params;
  const scheduledAt = parseEventTime(event.time);
  const reminderAt = new Date(scheduledAt.getTime() - 30 * 60 * 1000);

  const req = await createServiceRequest(tenantId, userId, userRole, {
    type: ServiceRequestType.GENERAL,
    title: event.title,
    description: event.description || params.sourceText,
    guestRoom: "—",
    guestName: "內部行程",
    targetDepartment: roleToDepartment(userRole),
    scheduledAt,
    reminderAt: reminderAt > new Date() ? reminderAt : undefined,
  });

  return `行程／預約：${req.title}（${scheduledAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}）`;
}
