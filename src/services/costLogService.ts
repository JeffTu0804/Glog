import type { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";

const COST_LOG_INCLUDE = {
  ticket: {
    select: {
      id: true,
      title: true,
      status: true,
      asset: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.CostLogInclude;

export interface ListCostLogsQuery {
  ticketId?: string;
  category?: string;
}

export async function findCostLogForTenant(
  tenantId: string,
  costLogId: string,
) {
  const costLog = await prisma.costLog.findFirst({
    where: withTenantScope(tenantId, { id: costLogId }),
    include: COST_LOG_INCLUDE,
  });

  if (!costLog) {
    throw new AppError(404, "找不到成本紀錄");
  }

  return costLog;
}

export async function listCostLogs(
  tenantId: string,
  query: ListCostLogsQuery,
) {
  const where: Prisma.CostLogWhereInput = { tenantId };

  if (query.ticketId) {
    where.ticketId = query.ticketId;
  }
  if (query.category) {
    where.category = query.category;
  }

  return prisma.costLog.findMany({
    where,
    include: COST_LOG_INCLUDE,
    orderBy: { recordedAt: "desc" },
  });
}
