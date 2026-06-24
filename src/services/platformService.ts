import {
  SubscriptionPlan,
  SubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { parseEnumValue } from "../utils/validators.js";

const VALID_PLANS = Object.values(SubscriptionPlan);
const VALID_STATUSES = Object.values(SubscriptionStatus);

export interface TenantListQuery {
  status?: SubscriptionStatus;
  plan?: SubscriptionPlan;
  search?: string;
}

export interface UpdateSubscriptionInput {
  plan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionEndsAt?: Date | null;
  contactEmail?: string;
}

export function parseSubscriptionPlan(value: unknown): SubscriptionPlan {
  return parseEnumValue(value, VALID_PLANS, "plan");
}

export function parseSubscriptionStatus(value: unknown): SubscriptionStatus {
  return parseEnumValue(value, VALID_STATUSES, "subscriptionStatus");
}

async function getTenantStats(tenantId: string) {
  const [userCount, assetCount, ticketCount, openTicketCount, costAgg] =
    await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.asset.count({ where: { tenantId } }),
      prisma.maintenanceTicket.count({ where: { tenantId } }),
      prisma.maintenanceTicket.count({
        where: {
          tenantId,
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
        },
      }),
      prisma.costLog.aggregate({
        where: { tenantId },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

  return {
    userCount,
    assetCount,
    ticketCount,
    openTicketCount,
    totalCost: costAgg._sum.amount?.toString() ?? "0",
    costLogCount: costAgg._count,
  };
}

export async function getPlatformOverview() {
  const [
    tenantCount,
    activeTenants,
    totalTickets,
    openTickets,
    totalUsers,
    costAgg,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({
      where: { subscriptionStatus: { in: ["ACTIVE", "TRIAL"] } },
    }),
    prisma.maintenanceTicket.count(),
    prisma.maintenanceTicket.count({
      where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
    }),
    prisma.user.count(),
    prisma.costLog.aggregate({ _sum: { amount: true } }),
  ]);

  return {
    tenantCount,
    activeTenants,
    totalTickets,
    openTickets,
    totalUsers,
    totalPlatformCost: costAgg._sum.amount?.toString() ?? "0",
  };
}

export async function listTenants(query: TenantListQuery) {
  const where: Prisma.TenantWhereInput = {};

  if (query.status) where.subscriptionStatus = query.status;
  if (query.plan) where.plan = query.plan;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { slug: { contains: query.search, mode: "insensitive" } },
      { contactEmail: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    tenants.map(async (tenant) => ({
      ...tenant,
      stats: await getTenantStats(tenant.id),
    })),
  );
}

export async function findTenantOrThrow(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    throw new AppError(404, "找不到租戶");
  }

  const stats = await getTenantStats(tenantId);
  return { ...tenant, stats };
}

export async function updateTenantSubscription(
  tenantId: string,
  input: UpdateSubscriptionInput,
) {
  await findTenantOrThrow(tenantId);

  return prisma.tenant.update({
    where: { id: tenantId },
    data: input,
  });
}

export async function getTenantTickets(tenantId: string, status?: string) {
  await findTenantOrThrow(tenantId);

  const where: Prisma.MaintenanceTicketWhereInput = { tenantId };
  if (status) {
    where.status = status as Prisma.EnumTicketStatusFilter["equals"];
  }

  return prisma.maintenanceTicket.findMany({
    where,
    include: {
      asset: { select: { id: true, name: true, code: true } },
      triggeredBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getTenantCostLogs(tenantId: string) {
  await findTenantOrThrow(tenantId);

  return prisma.costLog.findMany({
    where: { tenantId },
    include: {
      ticket: {
        select: {
          id: true,
          title: true,
          asset: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { recordedAt: "desc" },
    take: 100,
  });
}

export async function getTenantUsers(tenantId: string) {
  await findTenantOrThrow(tenantId);

  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      skills: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getTenantAssets(tenantId: string) {
  await findTenantOrThrow(tenantId);

  return prisma.asset.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  });
}
