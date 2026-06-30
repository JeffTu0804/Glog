import { ShiftLogbookStatus, type Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { generateAiSummary } from "./aiSummaryService.js";
import { collectShiftSnapshot } from "./logbookCollectorService.js";
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

function serializeLogbook(logbook: LogbookPayload) {
  return {
    id: logbook.id,
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
    entries: logbook.entries.map((e) => ({
      id: e.id,
      content: e.content,
      createdAt: e.createdAt.toISOString(),
      author: e.author,
    })),
    createdAt: logbook.createdAt.toISOString(),
  };
}

export async function getOrCreateCurrentLogbook(
  tenantId: string,
  userId: string,
) {
  const shift = resolveCurrentShift();

  const logbook = await prisma.shiftLogbook.upsert({
    where: {
      tenantId_shiftType_shiftDate: {
        tenantId,
        shiftType: shift.shiftType,
        shiftDate: shift.shiftDate,
      },
    },
    update: {},
    create: {
      tenantId,
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

export async function getLatestPublishedLogbook(tenantId: string) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, { status: ShiftLogbookStatus.PUBLISHED }),
    orderBy: { publishedAt: "desc" },
    include: LOGBOOK_INCLUDE,
  });

  return logbook ? serializeLogbook(logbook) : null;
}

export async function listLogbooks(tenantId: string, limit = 20) {
  const logbooks = await prisma.shiftLogbook.findMany({
    where: withTenantScope(tenantId, {}),
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
    },
    include: { author: { select: { id: true, name: true } } },
  });

  return {
    entry: {
      id: entry.id,
      content: entry.content,
      createdAt: entry.createdAt.toISOString(),
      author: entry.author,
    },
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

  const snapshot = await collectShiftSnapshot(tenantId, shift, logbookId);
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

  return serializeLogbook(updated);
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

  const snapshot = await collectShiftSnapshot(tenantId, shift, logbookId);
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
