import { AssetStatus, TicketPriority, TicketStatus, UserRole, UserStatus, type Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import {
  assignEngineerInTransaction,
  tryAutoDispatch,
} from "./dispatchService.js";
import {
  cancelTicketEscalationReminders,
  handleMaintenanceTicketCreated,
} from "./ticketAlertService.js";

export const TICKET_INCLUDE = {
  asset: {
    select: { id: true, name: true, code: true, type: true, status: true },
  },
  triggeredBy: {
    select: { id: true, name: true, email: true, role: true },
  },
  assignedTo: {
    select: { id: true, name: true, email: true, role: true },
  },
  attachments: {
    select: {
      id: true,
      url: true,
      mimeType: true,
      kind: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.MaintenanceTicketInclude;

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority));
const VALID_STATUSES = new Set<string>(Object.values(TicketStatus));

/** 允許的工單狀態轉換表 */
const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.ASSIGNED, TicketStatus.CANCELLED],
  [TicketStatus.ASSIGNED]: [TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.CANCELLED],
  [TicketStatus.PENDING_FRONT_DESK]: [],
  [TicketStatus.COMPLETED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
  [TicketStatus.CANCELLED]: [],
};

export interface CreateTicketInput {
  assetId: string;
  title: string;
  description?: string;
  priority?: TicketPriority;
  requiredSkills?: string[];
}

export interface CreateTicketOptions {
  /** 指定工程師 ID 時略過自動派單演算法 */
  assigneeUserId?: string;
  /** 僅通知部門、不自動派單（LINE 部門接單流程） */
  departmentOnly?: boolean;
}

export interface ListTicketsQuery {
  status?: TicketStatus;
  assignedToId?: string;
  assetId?: string;
}

export interface CreateTicketResult {
  ticket: Prisma.MaintenanceTicketGetPayload<{
    include: typeof TICKET_INCLUDE;
  }>;
  autoDispatched: boolean;
}

export function parseTicketPriority(value: unknown): TicketPriority {
  if (typeof value !== "string" || !VALID_PRIORITIES.has(value)) {
    throw new AppError(400, "無效的 priority 值");
  }
  return value as TicketPriority;
}

export function parseTicketStatus(value: unknown): TicketStatus {
  if (typeof value !== "string" || !VALID_STATUSES.has(value)) {
    throw new AppError(400, "無效的 status 值");
  }
  return value as TicketStatus;
}

export async function findTicketForTenant(tenantId: string, ticketId: string) {
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: withTenantScope(tenantId, { id: ticketId }),
    include: TICKET_INCLUDE,
  });

  if (!ticket) {
    throw new AppError(404, "找不到工單");
  }

  return ticket;
}

export async function assertAssetInTenant(tenantId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: withTenantScope(tenantId, { id: assetId }),
  });

  if (!asset) {
    throw new AppError(404, "找不到資產或資產不屬於此租戶");
  }

  return asset;
}

export async function assertEngineerInTenant(
  tenantId: string,
  engineerId: string,
) {
  const engineer = await prisma.user.findFirst({
    where: withTenantScope(tenantId, {
      id: engineerId,
      role: UserRole.ENGINEER,
    }),
  });

  if (!engineer) {
    throw new AppError(404, "找不到工程師或該使用者不是工程師");
  }

  return engineer;
}

export function assertStatusTransition(
  current: TicketStatus,
  next: TicketStatus,
): void {
  const allowed = STATUS_TRANSITIONS[current];

  if (!allowed.includes(next)) {
    throw new AppError(400, `無法從 ${current} 轉換為 ${next}`);
  }
}

export function buildStatusTimestamps(
  nextStatus: TicketStatus,
): Partial<Prisma.MaintenanceTicketUpdateInput> {
  const now = new Date();

  switch (nextStatus) {
    case TicketStatus.ASSIGNED:
      return { assignedAt: now };
    case TicketStatus.COMPLETED:
      return { completedAt: now };
    case TicketStatus.CLOSED:
      return { closedAt: now };
    default:
      return {};
  }
}

/**
 * 建立工單並嘗試自動派單（依 IDLE 工程師 + skills 匹配）。
 */
export async function createTicket(
  tenantId: string,
  triggeredById: string,
  input: CreateTicketInput,
  options?: CreateTicketOptions,
): Promise<CreateTicketResult> {
  const asset = await assertAssetInTenant(tenantId, input.assetId);
  const requiredSkills = input.requiredSkills ?? [];

  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.maintenanceTicket.create({
      data: {
        tenantId,
        assetId: input.assetId,
        triggeredById,
        title: input.title,
        description: input.description,
        priority: input.priority ?? TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
      },
    });

    let autoDispatched = false;

    if (options?.departmentOnly) {
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.MAINTENANCE },
      });
    } else if (options?.assigneeUserId) {
      await assertEngineerInTenant(tenantId, options.assigneeUserId);
      await assignEngineerInTransaction(
        tx,
        tenantId,
        ticket.id,
        options.assigneeUserId,
        asset.id,
      );
      autoDispatched = true;
    } else {
      const dispatch = await tryAutoDispatch(
        tx,
        tenantId,
        ticket.id,
        asset.id,
        requiredSkills,
      );
      autoDispatched = dispatch.dispatched;
    }

    const fullTicket = await tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: TICKET_INCLUDE,
    });

    return { ticket: fullTicket, autoDispatched };
  });

  const triggeredBy = await prisma.user.findUnique({
    where: { id: triggeredById },
    select: { name: true },
  });

  void handleMaintenanceTicketCreated({
    tenantId,
    ticket: {
      id: result.ticket.id,
      title: result.ticket.title,
      description: result.ticket.description,
      priority: result.ticket.priority,
      asset: result.ticket.asset,
    },
    triggeredByName: triggeredBy?.name ?? "同仁",
    autoDispatched: result.autoDispatched,
    assigneeName: result.ticket.assignedTo?.name,
    departmentOnly: options?.departmentOnly ?? false,
  });

  return result;
}

export async function listTickets(tenantId: string, query: ListTicketsQuery) {
  const where: Prisma.MaintenanceTicketWhereInput = { tenantId };

  if (query.status) {
    where.status = query.status;
  }
  if (query.assignedToId) {
    where.assignedToId = query.assignedToId;
  }
  if (query.assetId) {
    where.assetId = query.assetId;
  }

  return prisma.maintenanceTicket.findMany({
    where,
    include: TICKET_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function assignTicket(
  tenantId: string,
  ticketId: string,
  engineerId: string,
) {
  const ticket = await findTicketForTenant(tenantId, ticketId);

  if (ticket.status !== TicketStatus.OPEN) {
    throw new AppError(400, "僅 OPEN 狀態的工單可以派單");
  }

  await assertEngineerInTenant(tenantId, engineerId);

  return prisma.$transaction(async (tx) => {
    await assignEngineerInTransaction(
      tx,
      tenantId,
      ticket.id,
      engineerId,
      ticket.assetId,
    );

    await cancelTicketEscalationReminders(ticket.id);

    return tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: TICKET_INCLUDE,
    });
  });
}

export async function updateTicketStatus(
  tenantId: string,
  ticketId: string,
  nextStatus: TicketStatus,
  actor: { id: string; role: UserRole },
) {
  const ticket = await findTicketForTenant(tenantId, ticketId);

  if (actor.role === UserRole.ENGINEER) {
    if (ticket.assignedToId !== actor.id) {
      throw new AppError(403, "僅能更新指派給自己的工單");
    }

    if (nextStatus !== TicketStatus.IN_PROGRESS) {
      throw new AppError(
        403,
        "工程師僅能將工單更新為 IN_PROGRESS；完工結案請使用 PATCH /:id/close",
      );
    }
  }

  if (nextStatus === TicketStatus.CANCELLED && actor.role !== UserRole.ADMIN) {
    throw new AppError(403, "僅管理員可以取消工單");
  }

  if (
    nextStatus === TicketStatus.COMPLETED ||
    nextStatus === TicketStatus.CLOSED
  ) {
    throw new AppError(400, "請使用 PATCH /:id/close 端點進行結案");
  }

  assertStatusTransition(ticket.status, nextStatus);

  if (nextStatus === TicketStatus.ASSIGNED) {
    throw new AppError(400, "請使用 PATCH /:id/assign 端點進行派單");
  }

  if (nextStatus === TicketStatus.CANCELLED) {
    return prisma.$transaction(async (tx) => {
      if (ticket.assignedToId) {
        await tx.user.update({
          where: { id: ticket.assignedToId },
          data: { status: UserStatus.IDLE },
        });
      }

      await tx.asset.update({
        where: { id: ticket.assetId },
        data: { status: AssetStatus.OPERATIONAL },
      });

      await cancelTicketEscalationReminders(ticket.id);

      return tx.maintenanceTicket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.CANCELLED },
        include: TICKET_INCLUDE,
      });
    });
  }

  return prisma.maintenanceTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      ...buildStatusTimestamps(nextStatus),
    },
    include: TICKET_INCLUDE,
  });
}
