import {
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountStatus,
  UserPositionLevel,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { roleToDepartment } from "../utils/department.js";
import { parseEnumValue } from "../utils/validators.js";

const VALID_PLANS = Object.values(SubscriptionPlan);
const VALID_STATUSES = Object.values(SubscriptionStatus);

const tenantBriefSelect = { id: true, name: true, slug: true } as const;

const platformUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  accountStatus: true,
  positionLevel: true,
  createdAt: true,
  tenant: { select: tenantBriefSelect },
} satisfies Prisma.UserSelect;

function serializePlatformUser(
  user: Prisma.UserGetPayload<{ select: typeof platformUserSelect }>,
) {
  return {
    ...user,
    department: roleToDepartment(user.role),
    createdAt: user.createdAt.toISOString(),
  };
}

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

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: platformUserSelect,
    orderBy: { name: "asc" },
  });

  return users.map(serializePlatformUser);
}

export async function getTenantAssets(tenantId: string) {
  await findTenantOrThrow(tenantId);

  return prisma.asset.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  });
}

export async function getTenantInventory(tenantId: string) {
  await findTenantOrThrow(tenantId);

  return prisma.inventory.findMany({
    where: { tenantId },
    orderBy: [{ quantity: "asc" }, { name: "asc" }],
  });
}

export interface PlatformListQuery {
  tenantId?: string;
  lowStock?: boolean;
}

export async function listPlatformInventory(query: PlatformListQuery) {
  const where: Prisma.InventoryWhereInput = {};
  if (query.tenantId) where.tenantId = query.tenantId;

  const items = await prisma.inventory.findMany({
    where,
    include: { tenant: { select: tenantBriefSelect } },
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    take: 200,
  });

  if (query.lowStock) {
    return items.filter((item) => item.quantity <= item.reorderLevel);
  }

  return items;
}

export async function listPlatformCostLogs(query: { tenantId?: string }) {
  const where: Prisma.CostLogWhereInput = {};
  if (query.tenantId) where.tenantId = query.tenantId;

  return prisma.costLog.findMany({
    where,
    include: {
      tenant: { select: tenantBriefSelect },
      ticket: {
        select: {
          id: true,
          title: true,
          asset: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { recordedAt: "desc" },
    take: 200,
  });
}

export async function listPlatformUsers(query: { tenantId?: string }) {
  const where: Prisma.UserWhereInput = {};
  if (query.tenantId) where.tenantId = query.tenantId;

  const users = await prisma.user.findMany({
    where,
    select: platformUserSelect,
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    take: 200,
  });

  return users.map(serializePlatformUser);
}

export interface UpdatePlatformUserInput {
  tenantId?: string;
  role?: UserRole;
  name?: string;
  accountStatus?: UserAccountStatus;
  positionLevel?: UserPositionLevel;
}

export function parseUpdatePlatformUserBody(body: Record<string, unknown>) {
  const input: UpdatePlatformUserInput = {};

  if (body.tenantId !== undefined) {
    if (typeof body.tenantId !== "string" || !body.tenantId.trim()) {
      throw new AppError(400, "tenantId 格式無效");
    }
    input.tenantId = body.tenantId.trim();
  }

  if (body.role !== undefined) {
    input.role = parseEnumValue(body.role, Object.values(UserRole), "role");
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new AppError(400, "姓名不可為空");
    }
    input.name = body.name.trim();
  }

  if (body.accountStatus !== undefined) {
    input.accountStatus = parseEnumValue(
      body.accountStatus,
      Object.values(UserAccountStatus),
      "accountStatus",
    );
  }

  if (body.positionLevel !== undefined) {
    input.positionLevel = parseEnumValue(
      body.positionLevel,
      Object.values(UserPositionLevel),
      "positionLevel",
    );
  }

  if (Object.keys(input).length === 0) {
    throw new AppError(400, "請提供至少一個要更新的欄位");
  }

  return input;
}

export async function updatePlatformUser(userId: string, input: UpdatePlatformUserInput) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new AppError(404, "找不到員工");
  }

  if (input.tenantId && input.tenantId !== existing.tenantId) {
    await findTenantOrThrow(input.tenantId);
    const conflict = await prisma.user.findUnique({
      where: {
        tenantId_email: { tenantId: input.tenantId, email: existing.email },
      },
    });
    if (conflict && conflict.id !== userId) {
      throw new AppError(400, "目標飯店已有相同帳號的員工");
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.accountStatus !== undefined ? { accountStatus: input.accountStatus } : {}),
      ...(input.positionLevel !== undefined ? { positionLevel: input.positionLevel } : {}),
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    },
    select: platformUserSelect,
  });

  return serializePlatformUser(updated);
}
