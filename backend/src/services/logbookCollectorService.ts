import { AssetStatus, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import type { ResolvedShift } from "./shiftService.js";

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "待派單",
  ASSIGNED: "已指派",
  IN_PROGRESS: "進行中",
  PENDING_FRONT_DESK: "待前台協助",
  COMPLETED: "已完工",
  CLOSED: "已結案",
  CANCELLED: "已取消",
};

const PRIORITY_LABELS = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  URGENT: "緊急",
};

export interface ShiftSnapshot {
  shift: {
    label: string;
    shiftType: string;
    window: string;
  };
  manualNotes: Array<{ author: string; content: string; at: string }>;
  tickets: {
    created: Array<{
      title: string;
      asset: string;
      priority: string;
      status: string;
      by: string;
    }>;
    updated: Array<{
      title: string;
      asset: string;
      status: string;
      assignee: string | null;
    }>;
    stillOpen: Array<{
      title: string;
      asset: string;
      priority: string;
      status: string;
    }>;
  };
  locations: {
    maintenance: string[];
    outOfOrder: string[];
  };
  inventory: {
    lowStock: Array<{ name: string; quantity: number; reorderLevel: number }>;
  };
  costs: {
    totalAmount: number;
    items: Array<{ description: string; amount: number }>;
  };
}

export async function collectShiftSnapshot(
  tenantId: string,
  shift: ResolvedShift,
  logbookId: string,
): Promise<ShiftSnapshot> {
  const { shiftStart, shiftEnd } = shift;

  const [entries, ticketsCreated, ticketsUpdated, openTickets, assets, lowStock, costs] =
    await Promise.all([
      prisma.shiftLogEntry.findMany({
        where: { logbookId, tenantId },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.maintenanceTicket.findMany({
        where: withTenantScope(tenantId, {
          triggeredAt: { gte: shiftStart, lt: shiftEnd },
        }),
        include: {
          asset: { select: { code: true, name: true } },
          triggeredBy: { select: { name: true } },
        },
        orderBy: { triggeredAt: "desc" },
      }),
      prisma.maintenanceTicket.findMany({
        where: withTenantScope(tenantId, {
          updatedAt: { gte: shiftStart, lt: shiftEnd },
          triggeredAt: { lt: shiftStart },
        }),
        include: {
          asset: { select: { code: true, name: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.maintenanceTicket.findMany({
        where: withTenantScope(tenantId, {
          status: {
            in: [
              TicketStatus.OPEN,
              TicketStatus.ASSIGNED,
              TicketStatus.IN_PROGRESS,
              TicketStatus.PENDING_FRONT_DESK,
              TicketStatus.COMPLETED,
            ],
          },
        }),
        include: { asset: { select: { code: true, name: true } } },
        orderBy: { priority: "desc" },
        take: 30,
      }),
      prisma.asset.findMany({
        where: withTenantScope(tenantId, {
          status: { in: [AssetStatus.MAINTENANCE, AssetStatus.OUT_OF_ORDER] },
        }),
        select: { code: true, name: true, status: true },
      }),
      prisma.inventory.findMany({
        where: withTenantScope(tenantId, {}),
      }),
      prisma.costLog.findMany({
        where: withTenantScope(tenantId, {
          recordedAt: { gte: shiftStart, lt: shiftEnd },
        }),
        orderBy: { recordedAt: "desc" },
        take: 20,
      }),
    ]);

  const lowStockItems = lowStock
    .filter((item) => item.quantity <= item.reorderLevel)
    .map((item) => ({
      name: item.name,
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
    }));

  const costTotal = costs.reduce((sum, c) => sum + Number(c.amount), 0);

  return {
    shift: {
      label: shift.label,
      shiftType: shift.shiftType,
      window: `${shiftStart.toISOString()}–${shiftEnd.toISOString()}`,
    },
    manualNotes: entries.map((e) => ({
      author: e.author.name,
      content: e.content,
      at: e.createdAt.toISOString(),
    })),
    tickets: {
      created: ticketsCreated.map((t) => ({
        title: t.title,
        asset: `${t.asset.code} ${t.asset.name}`,
        priority: PRIORITY_LABELS[t.priority],
        status: TICKET_STATUS_LABELS[t.status],
        by: t.triggeredBy.name,
      })),
      updated: ticketsUpdated.map((t) => ({
        title: t.title,
        asset: `${t.asset.code} ${t.asset.name}`,
        status: TICKET_STATUS_LABELS[t.status],
        assignee: t.assignedTo?.name ?? null,
      })),
      stillOpen: openTickets.map((t) => ({
        title: t.title,
        asset: `${t.asset.code} ${t.asset.name}`,
        priority: PRIORITY_LABELS[t.priority],
        status: TICKET_STATUS_LABELS[t.status],
      })),
    },
    locations: {
      maintenance: assets
        .filter((a) => a.status === "MAINTENANCE")
        .map((a) => `${a.code} ${a.name}`),
      outOfOrder: assets
        .filter((a) => a.status === "OUT_OF_ORDER")
        .map((a) => `${a.code} ${a.name}`),
    },
    inventory: { lowStock: lowStockItems },
    costs: {
      totalAmount: costTotal,
      items: costs.map((c) => ({
        description: c.description,
        amount: Number(c.amount),
      })),
    },
  };
}
