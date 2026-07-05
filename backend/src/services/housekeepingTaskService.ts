import {
  TicketPriority,
  TicketStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import {
  assignHousekeeperInTransaction,
  tryAutoDispatchHousekeeping,
} from "./dispatchService.js";
import { notifyHousekeepingTaskCreated } from "./lineMessagingService.js";
import {
  TICKET_INCLUDE,
  assertAssetInTenant,
  type CreateTicketResult,
} from "./maintenanceTicketService.js";

export interface CreateHousekeepingTaskInput {
  assetId: string;
  title: string;
  description?: string;
  priority?: TicketPriority;
}

export interface CreateHousekeepingTaskOptions {
  assigneeUserId?: string;
}

async function assertHousekeeperInTenant(tenantId: string, userId: string) {
  const housekeeper = await prisma.user.findFirst({
    where: { id: userId, tenantId, role: UserRole.HOUSEKEEPING },
  });

  if (!housekeeper) {
    throw new AppError(404, "找不到房務人員");
  }

  return housekeeper;
}

/**
 * 建立房務清潔工單（結構對齊工程工單，日後可擴充相同閉環流程）。
 */
export async function createHousekeepingTask(
  tenantId: string,
  triggeredById: string,
  input: CreateHousekeepingTaskInput,
  options?: CreateHousekeepingTaskOptions,
): Promise<CreateTicketResult> {
  const asset = await assertAssetInTenant(tenantId, input.assetId);

  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.maintenanceTicket.create({
      data: {
        tenantId,
        assetId: input.assetId,
        triggeredById,
        title: input.title.startsWith("[房務]")
          ? input.title
          : `[房務] ${input.title}`,
        description: input.description,
        priority: input.priority ?? TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
      },
    });

    let autoDispatched = false;

    if (options?.assigneeUserId) {
      await assertHousekeeperInTenant(tenantId, options.assigneeUserId);
      await assignHousekeeperInTransaction(
        tx,
        tenantId,
        ticket.id,
        options.assigneeUserId,
        asset.id,
      );
      autoDispatched = true;
    } else {
      const dispatch = await tryAutoDispatchHousekeeping(
        tx,
        tenantId,
        ticket.id,
        asset.id,
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

  void notifyHousekeepingTaskCreated({
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
  });

  return result;
}

export type HousekeepingTicket = Prisma.MaintenanceTicketGetPayload<{
  include: typeof TICKET_INCLUDE;
}>;
