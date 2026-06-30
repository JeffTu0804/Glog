import { AssetStatus, Prisma, TicketStatus, UserRole, UserStatus } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { TICKET_INCLUDE } from "./maintenanceTicketService.js";

export interface InventoryUsage {
  inventoryId: string;
  quantity: number;
}

export interface CloseTicketInput {
  inventoryUsages: InventoryUsage[];
  laborCost?: number;
  laborDescription?: string;
}

function parseInventoryUsages(value: InventoryUsage[], optional: boolean): void {
  if (!Array.isArray(value)) {
    throw new AppError(400, "inventoryUsages 格式無效");
  }

  if (!optional && value.length === 0) {
    throw new AppError(400, "inventoryUsages 為必填且至少需一項耗材");
  }

  for (const usage of value) {
    if (typeof usage.inventoryId !== "string" || !usage.inventoryId) {
      throw new AppError(400, "inventoryUsages 每項需包含有效的 inventoryId");
    }
    if (
      typeof usage.quantity !== "number" ||
      !Number.isInteger(usage.quantity) ||
      usage.quantity <= 0
    ) {
      throw new AppError(400, "inventoryUsages 每項 quantity 必須為正整數");
    }
  }
}

/**
 * 工單結案閉環：以 Transaction 同時完成
 * 工單結案、耗材扣除、CostLog 寫入、工程師釋放、資產恢復正常。
 */
export async function closeTicket(
  tenantId: string,
  ticketId: string,
  actor: { id: string; role: UserRole },
  input: CloseTicketInput,
) {
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: withTenantScope(tenantId, { id: ticketId }),
  });

  if (!ticket) {
    throw new AppError(404, "找不到工單");
  }

  const inventoryOptional = ticket.status === TicketStatus.COMPLETED;
  parseInventoryUsages(input.inventoryUsages, inventoryOptional);

  if (input.laborCost !== undefined && input.laborCost < 0) {
    throw new AppError(400, "laborCost 不可為負數");
  }

  if (
    actor.role === UserRole.ENGINEER &&
    ticket.assignedToId !== actor.id
  ) {
    throw new AppError(403, "僅能結案指派給自己的工單");
  }

  const closableStatuses: TicketStatus[] = [
    TicketStatus.IN_PROGRESS,
    TicketStatus.COMPLETED,
  ];
  if (!closableStatuses.includes(ticket.status)) {
    throw new AppError(400, "此工單狀態無法結案");
  }

  const inventoryIds = input.inventoryUsages.map((u) => u.inventoryId);
  const inventoryItems =
    inventoryIds.length > 0
      ? await prisma.inventory.findMany({
          where: { tenantId, id: { in: inventoryIds } },
        })
      : [];

  if (inventoryItems.length !== inventoryIds.length) {
    throw new AppError(404, "部分耗材不存在或不屬於此租戶");
  }

  const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));

  for (const usage of input.inventoryUsages) {
    const item = inventoryMap.get(usage.inventoryId)!;
    if (item.quantity < usage.quantity) {
      throw new AppError(
        400,
        `耗材「${item.name}」庫存不足（現有 ${item.quantity}，需要 ${usage.quantity}）`,
      );
    }
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    for (const usage of input.inventoryUsages) {
      const item = inventoryMap.get(usage.inventoryId)!;

      await tx.inventory.update({
        where: { id: item.id },
        data: { quantity: { decrement: usage.quantity } },
      });

      const amount = item.unitCost.mul(usage.quantity);

      await tx.costLog.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          description: `${item.name} × ${usage.quantity}`,
          amount,
          category: "耗材",
          recordedAt: now,
        },
      });
    }

    if (input.laborCost !== undefined && input.laborCost > 0) {
      await tx.costLog.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          description: input.laborDescription ?? "維修人工",
          amount: new Prisma.Decimal(input.laborCost),
          category: "人工",
          recordedAt: now,
        },
      });
    }

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

    return tx.maintenanceTicket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.CLOSED,
        completedAt: ticket.completedAt ?? now,
        closedAt: now,
      },
      include: TICKET_INCLUDE,
    });
  });
}
