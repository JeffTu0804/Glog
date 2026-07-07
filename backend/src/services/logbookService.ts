import { Department, ShiftLogbookStatus, UserRole, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { DEPARTMENT_LABELS, roleToDepartment } from "../utils/department.js";
import {
  resolveRoutedDepartments,
  routingToDbFields,
  normalizeRoutingDecision,
} from "../utils/routingDecision.js";
import type { RoutingDecision } from "../types/lineWebhook.js";
import { parseLineMessageSemantics } from "./lineSemanticParserService.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { generateAiSummary } from "./aiSummaryService.js";
import {
  collectShiftSnapshot,
  extractShiftDraft,
  type ShiftDraftItem,
} from "./logbookCollectorService.js";
import { tryCreateTicketFromLogbookEntry } from "./logbookAlertService.js";
import { notifyDepartmentHandover } from "./lineMessagingService.js";
import {
  formatShiftWindow,
  getShiftLabel,
  resolveCurrentShift,
} from "./shiftService.js";

const LOGBOOK_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  publishedBy: { select: { id: true, name: true } },
  entries: {
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ShiftLogbookInclude;

export type LogbookPayload = Prisma.ShiftLogbookGetPayload<{
  include: typeof LOGBOOK_INCLUDE;
}>;

type LogEntryRow = LogbookPayload["entries"][number];

function serializeLogEntry(e: LogEntryRow) {
  return {
    id: e.id,
    content: e.content,
    visibility: e.visibility,
    sharedWith: e.sharedWith,
    routingReason: e.routingReason,
    urgency: e.urgency,
    sourceDepartment: e.sourceDepartment,
    isRoutedMirror: e.isRoutedMirror,
    createdAt: e.createdAt.toISOString(),
    author: e.author,
  };
}

function serializeLogbook(logbook: LogbookPayload) {
  return {
    id: logbook.id,
    department: logbook.department,
    departmentLabel: DEPARTMENT_LABELS[logbook.department],
    shiftType: logbook.shiftType,
    shiftLabel: getShiftLabel(logbook.shiftType),
    shiftDate: logbook.shiftDate.toISOString().slice(0, 10),
    shiftWindow: formatShiftWindow(logbook.shiftStart, logbook.shiftEnd),
    shiftStart: logbook.shiftStart.toISOString(),
    shiftEnd: logbook.shiftEnd.toISOString(),
    status: logbook.status,
    aiSummary: logbook.aiSummary,
    highlights: logbook.highlights,
    openItems: logbook.openItems,
    createdBy: logbook.createdBy,
    publishedBy: logbook.publishedBy,
    publishedAt: logbook.publishedAt?.toISOString() ?? null,
    entries: logbook.entries.map(serializeLogEntry),
    createdAt: logbook.createdAt.toISOString(),
  };
}

export async function getOrCreateCurrentLogbook(
  tenantId: string,
  userId: string,
  department: Department,
) {
  const shift = resolveCurrentShift();

  const logbook = await prisma.shiftLogbook.upsert({
    where: {
      tenantId_department_shiftType_shiftDate: {
        tenantId,
        department,
        shiftType: shift.shiftType,
        shiftDate: shift.shiftDate,
      },
    },
    update: {},
    create: {
      tenantId,
      department,
      shiftType: shift.shiftType,
      shiftDate: shift.shiftDate,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      createdById: userId,
    },
    include: LOGBOOK_INCLUDE,
  });

  return { shift, logbook: serializeLogbook(logbook) };
}

export async function getLatestPublishedLogbook(
  tenantId: string,
  department: Department,
) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, {
      department,
      status: ShiftLogbookStatus.PUBLISHED,
    }),
    orderBy: { publishedAt: "desc" },
    include: LOGBOOK_INCLUDE,
  });

  return logbook ? serializeLogbook(logbook) : null;
}

export async function listLogbooks(
  tenantId: string,
  department: Department,
  limit = 20,
) {
  const logbooks = await prisma.shiftLogbook.findMany({
    where: withTenantScope(tenantId, { department }),
    orderBy: [{ shiftDate: "desc" }, { shiftStart: "desc" }],
    take: limit,
    include: LOGBOOK_INCLUDE,
  });

  return logbooks.map(serializeLogbook);
}

export async function getLogbook(tenantId: string, logbookId: string) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, { id: logbookId }),
    include: LOGBOOK_INCLUDE,
  });

  if (!logbook) {
    throw new AppError(404, "找不到交班日誌");
  }

  return serializeLogbook(logbook);
}

export async function addLogEntry(
  tenantId: string,
  userId: string,
  logbookId: string,
  content: string,
) {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new AppError(400, "備註內容不可為空");
  }

  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, { id: logbookId }),
  });

  if (!logbook) {
    throw new AppError(404, "找不到交班日誌");
  }

  if (logbook.status !== ShiftLogbookStatus.OPEN) {
    throw new AppError(400, "此班次日誌已交班，無法新增備註");
  }

  const entry = await prisma.shiftLogEntry.create({
    data: {
      tenantId,
      logbookId,
      authorId: userId,
      content: trimmed,
      sourceDepartment: logbook.department,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  const ticketAlert = await tryCreateTicketFromLogbookEntry(
    tenantId,
    userId,
    logbook.department,
    trimmed,
  );

  return {
    entry: serializeLogEntry(entry),
    ticketAlert,
  };
}

/** 依 AI routing_decision 寫入來源部門與同步部門看版 */
export async function addRoutedLogbookEntries(
  tenantId: string,
  userId: string,
  userRole: UserRole,
  content: string,
  routing: RoutingDecision,
) {
  const trimmed = content.trim();
  if (!trimmed) return { entries: [], routedDepartments: [] as Department[] };

  const sourceDepartment = roleToDepartment(userRole);
  const targetDepartments = resolveRoutedDepartments(sourceDepartment, routing);
  const routingGroupId = randomUUID();
  const dbRouting = routingToDbFields(routing, sourceDepartment);

  const createdEntries: ReturnType<typeof serializeLogEntry>[] = [];
  let ticketAlert: Awaited<ReturnType<typeof tryCreateTicketFromLogbookEntry>> = null;

  for (const department of targetDepartments) {
    const { logbook } = await getOrCreateCurrentLogbook(tenantId, userId, department);
    if (logbook.status !== "OPEN") continue;

    const isMirror = department !== sourceDepartment;
    const mirrorPrefix = isMirror
      ? `【${DEPARTMENT_LABELS[sourceDepartment]}同步】`
      : "";
    const entryContent = mirrorPrefix ? `${mirrorPrefix} ${trimmed}` : trimmed;

    const entry = await prisma.shiftLogEntry.create({
      data: {
        tenantId,
        logbookId: logbook.id,
        authorId: userId,
        content: entryContent,
        visibility: dbRouting.visibility,
        sharedWith: dbRouting.sharedWith,
        routingReason: dbRouting.routingReason,
        urgency: dbRouting.urgency,
        sourceDepartment: dbRouting.sourceDepartment,
        routingGroupId,
        isRoutedMirror: isMirror,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    createdEntries.push(serializeLogEntry(entry));

    if (!isMirror) {
      ticketAlert = await tryCreateTicketFromLogbookEntry(
        tenantId,
        userId,
        department,
        trimmed,
      );
    }
  }

  return {
    entries: createdEntries,
    routedDepartments: targetDepartments,
    ticketAlert,
  };
}

export async function publishLogbook(
  tenantId: string,
  userId: string,
  logbookId: string,
) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, { id: logbookId }),
    include: LOGBOOK_INCLUDE,
  });

  if (!logbook) {
    throw new AppError(404, "找不到交班日誌");
  }

  if (logbook.status === ShiftLogbookStatus.PUBLISHED) {
    throw new AppError(400, "此班次日誌已交班");
  }

  const shift = {
    shiftType: logbook.shiftType,
    shiftDate: logbook.shiftDate,
    shiftStart: logbook.shiftStart,
    shiftEnd: logbook.shiftEnd,
    label: getShiftLabel(logbook.shiftType),
  };

  const snapshot = await collectShiftSnapshot(
    tenantId,
    shift,
    logbookId,
    logbook.department,
  );
  const ai = await generateAiSummary(snapshot);

  const updated = await prisma.shiftLogbook.update({
    where: { id: logbookId },
    data: {
      status: ShiftLogbookStatus.PUBLISHED,
      aiSummary: ai.aiSummary,
      highlights: ai.highlights,
      openItems: ai.openItems,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      publishedById: userId,
      publishedAt: new Date(),
    },
    include: LOGBOOK_INCLUDE,
  });

  const serialized = serializeLogbook(updated);

  void notifyDepartmentHandover({
    tenantId,
    department: logbook.department,
    shiftLabel: serialized.shiftLabel,
    shiftDate: serialized.shiftDate,
    shiftWindow: serialized.shiftWindow,
    publishedByName: serialized.publishedBy?.name ?? "同仁",
    aiSummary: serialized.aiSummary ?? "",
    highlights: serialized.highlights,
    openItems: serialized.openItems,
  });

  return serialized;
}

export async function refreshAiSummary(tenantId: string, logbookId: string) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, { id: logbookId }),
  });

  if (!logbook) {
    throw new AppError(404, "找不到交班日誌");
  }

  const shift = {
    shiftType: logbook.shiftType,
    shiftDate: logbook.shiftDate,
    shiftStart: logbook.shiftStart,
    shiftEnd: logbook.shiftEnd,
    label: getShiftLabel(logbook.shiftType),
  };

  const snapshot = await collectShiftSnapshot(
    tenantId,
    shift,
    logbookId,
    logbook.department,
  );
  const ai = await generateAiSummary(snapshot);

  const updated = await prisma.shiftLogbook.update({
    where: { id: logbookId },
    data: {
      aiSummary: ai.aiSummary,
      highlights: ai.highlights,
      openItems: ai.openItems,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
    },
    include: LOGBOOK_INCLUDE,
  });

  return serializeLogbook(updated);
}

export async function previewLogbookRouting(
  content: string,
  sourceDepartment: Department,
): Promise<RoutingDecision> {
  const parsed = await parseLineMessageSemantics(content, sourceDepartment);
  return parsed.routing_decision;
}

export async function getShiftDraft(
  tenantId: string,
  logbookId: string,
  department: Department,
) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, { id: logbookId }),
  });

  if (!logbook) {
    throw new AppError(404, "找不到交班日誌");
  }

  const shift = {
    shiftType: logbook.shiftType,
    shiftDate: logbook.shiftDate,
    shiftStart: logbook.shiftStart,
    shiftEnd: logbook.shiftEnd,
    label: getShiftLabel(logbook.shiftType),
  };

  const snapshot = await collectShiftSnapshot(
    tenantId,
    shift,
    logbookId,
    department,
  );

  return {
    items: extractShiftDraft(snapshot),
    refreshedAt: new Date().toISOString(),
  } satisfies { items: ShiftDraftItem[]; refreshedAt: string };
}

/** LINE 或語音補充寫入當班交班日誌（含跨部門路由） */
export async function addLineLogbookSupplement(
  tenantId: string,
  userId: string,
  userRole: UserRole,
  content: string,
  routing?: RoutingDecision,
) {
  if (routing) {
    return addRoutedLogbookEntries(tenantId, userId, userRole, content, routing);
  }

  const trimmed = content.trim();
  if (!trimmed) return null;

  const department = roleToDepartment(userRole);
  const { logbook } = await getOrCreateCurrentLogbook(tenantId, userId, department);

  if (logbook.status !== "OPEN") {
    return null;
  }

  return addLogEntry(tenantId, userId, logbook.id, trimmed);
}

/** LINE「交班」— 發布當部門交班日誌 */
export async function publishCurrentDepartmentLogbook(
  tenantId: string,
  userId: string,
  userRole: UserRole,
) {
  const department = roleToDepartment(userRole);
  const { logbook } = await getOrCreateCurrentLogbook(tenantId, userId, department);

  if (logbook.status === "PUBLISHED") {
    throw new AppError(400, "本班已交班，請等待下一班別");
  }

  return publishLogbook(tenantId, userId, logbook.id);
}
