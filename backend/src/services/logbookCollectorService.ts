import { AssetStatus, Department, ServiceRequestStatus, TicketStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { GUEST_REQUEST_LABELS, isGuestRequestType } from "../utils/guestRequestType.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { getHotelByTenantId } from "./hotelBootstrapService.js";
import type { ResolvedShift } from "./shiftService.js";

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "待派單",
  ASSIGNED: "已指派",
  IN_PROGRESS: "進行中",
  PENDING_FRONT_DESK: "待客務部協助",
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
  department: string;
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
  serviceRequests?: {
    pending: Array<{ title: string; guestRoom: string; guestName: string; scheduledAt: string }>;
    handled: Array<{ title: string; guestRoom: string; status: string }>;
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
  guestRequests?: {
    pending: Array<{ roomNumber: string; requestLabel: string; createdAt: string }>;
    handled: Array<{ roomNumber: string; requestLabel: string; status: string }>;
  };
}

export interface ShiftDraftItem {
  id: string;
  kind:
    | "ticket_open"
    | "ticket_created"
    | "service_pending"
    | "guest_pending"
    | "location"
    | "inventory";
  title: string;
  detail?: string;
}

export function extractShiftDraft(snapshot: ShiftSnapshot): ShiftDraftItem[] {
  const items: ShiftDraftItem[] = [];

  for (const t of snapshot.tickets.stillOpen) {
    items.push({
      id: `open-${t.asset}-${t.title}`,
      kind: "ticket_open",
      title: `${t.asset}：${t.title}`,
      detail: `狀態 ${t.status} · 優先 ${t.priority}`,
    });
  }

  for (const t of snapshot.tickets.created) {
    items.push({
      id: `new-${t.asset}-${t.title}`,
      kind: "ticket_created",
      title: `本班新建：${t.asset} ${t.title}`,
      detail: `${t.status} · ${t.by}`,
    });
  }

  if (snapshot.serviceRequests) {
    for (const r of snapshot.serviceRequests.pending) {
      items.push({
        id: `svc-${r.guestRoom}-${r.title}`,
        kind: "service_pending",
        title: `${r.guestRoom} 號房 · ${r.title}`,
        detail: r.guestName,
      });
    }
  }

  if (snapshot.guestRequests) {
    for (const r of snapshot.guestRequests.pending) {
      items.push({
        id: `guest-${r.roomNumber}-${r.requestLabel}`,
        kind: "guest_pending",
        title: `${r.roomNumber} 號房 · ${r.requestLabel}`,
        detail: "住客掃碼請求待處理",
      });
    }
  }

  for (const loc of snapshot.locations.outOfOrder) {
    items.push({
      id: `ooo-${loc}`,
      kind: "location",
      title: `故障地點：${loc}`,
    });
  }

  for (const loc of snapshot.locations.maintenance) {
    items.push({
      id: `maint-${loc}`,
      kind: "location",
      title: `維護中：${loc}`,
    });
  }

  for (const item of snapshot.inventory.lowStock) {
    items.push({
      id: `inv-${item.name}`,
      kind: "inventory",
      title: `庫存不足：${item.name}`,
      detail: `剩 ${item.quantity}（補貨線 ${item.reorderLevel}）`,
    });
  }

  return items;
}

function rolesForDepartmentFilter(department: Department): UserRole[] {
  switch (department) {
    case Department.FRONT_DESK:
      return [UserRole.FRONT_DESK];
    case Department.FOOD_BEVERAGE:
      return [UserRole.FOOD_BEVERAGE];
    case Department.HOUSEKEEPING:
      return [UserRole.HOUSEKEEPING];
    case Department.ENGINEERING:
      return [UserRole.ENGINEER];
    case Department.MANAGEMENT:
      return Object.values(UserRole);
  }
}

function departmentIncludesAll(department: Department): boolean {
  return department === Department.MANAGEMENT;
}

export async function collectShiftSnapshot(
  tenantId: string,
  shift: ResolvedShift,
  logbookId: string,
  department: Department,
): Promise<ShiftSnapshot> {
  const { shiftStart, shiftEnd } = shift;
  const deptRoles = rolesForDepartmentFilter(department);
  const includeAll = departmentIncludesAll(department);

  const ticketCreatedWhere = includeAll
    ? { triggeredAt: { gte: shiftStart, lt: shiftEnd } }
    : {
        triggeredAt: { gte: shiftStart, lt: shiftEnd },
        triggeredBy: { role: { in: deptRoles } },
      };

  const ticketUpdatedWhere = includeAll
    ? {
        updatedAt: { gte: shiftStart, lt: shiftEnd },
        triggeredAt: { lt: shiftStart },
      }
    : {
        updatedAt: { gte: shiftStart, lt: shiftEnd },
        triggeredAt: { lt: shiftStart },
        OR: [
          { triggeredBy: { role: { in: deptRoles } } },
          { assignedTo: { role: { in: deptRoles } } },
        ],
      };

  const openTicketWhere = includeAll
    ? {
        status: {
          in: [
            TicketStatus.OPEN,
            TicketStatus.ASSIGNED,
            TicketStatus.IN_PROGRESS,
            TicketStatus.PENDING_FRONT_DESK,
            TicketStatus.COMPLETED,
          ],
        },
      }
    : {
        status: {
          in: [
            TicketStatus.OPEN,
            TicketStatus.ASSIGNED,
            TicketStatus.IN_PROGRESS,
            TicketStatus.PENDING_FRONT_DESK,
            TicketStatus.COMPLETED,
          ],
        },
        OR: [
          { triggeredBy: { role: { in: deptRoles } } },
          { assignedTo: { role: { in: deptRoles } } },
        ],
      };

  const includeServiceRequests =
    department === Department.FRONT_DESK ||
    department === Department.FOOD_BEVERAGE ||
    department === Department.HOUSEKEEPING ||
    department === Department.ENGINEERING ||
    department === Department.MANAGEMENT;

  const includeGuestRequests =
    department === Department.FRONT_DESK ||
    department === Department.HOUSEKEEPING ||
    department === Department.ENGINEERING ||
    department === Department.MANAGEMENT;

  const hotel = includeGuestRequests ? await getHotelByTenantId(tenantId) : null;

  const [
    entries,
    ticketsCreated,
    ticketsUpdated,
    openTickets,
    assets,
    lowStock,
    costs,
    serviceRequests,
    guestRequests,
  ] = await Promise.all([
    prisma.shiftLogEntry.findMany({
      where: { logbookId, tenantId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.maintenanceTicket.findMany({
      where: withTenantScope(tenantId, ticketCreatedWhere),
      include: {
        asset: { select: { code: true, name: true } },
        triggeredBy: { select: { name: true } },
      },
      orderBy: { triggeredAt: "desc" },
    }),
    prisma.maintenanceTicket.findMany({
      where: withTenantScope(tenantId, ticketUpdatedWhere),
      include: {
        asset: { select: { code: true, name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.maintenanceTicket.findMany({
      where: withTenantScope(tenantId, openTicketWhere),
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
    includeServiceRequests
      ? prisma.serviceRequest.findMany({
          where: withTenantScope(tenantId, {
            OR: [
              {
                createdAt: { gte: shiftStart, lt: shiftEnd },
                ...(includeAll
                  ? {}
                  : {
                      OR: [
                        { targetDepartment: department },
                        { sourceDepartment: department },
                      ],
                    }),
              },
              {
                updatedAt: { gte: shiftStart, lt: shiftEnd },
                ...(includeAll
                  ? {}
                  : {
                      OR: [
                        { targetDepartment: department },
                        { sourceDepartment: department },
                      ],
                    }),
              },
              {
                status: {
                  in: [ServiceRequestStatus.PENDING, ServiceRequestStatus.CONFIRMED],
                },
                ...(includeAll
                  ? {}
                  : { targetDepartment: department }),
              },
            ],
          }),
          orderBy: { scheduledAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
    hotel
      ? prisma.guestRequest.findMany({
          where: {
            hotelId: hotel.id,
            OR: [
              {
                createdAt: { gte: shiftStart, lt: shiftEnd },
                ...(includeAll || department === Department.FRONT_DESK
                  ? {}
                  : { targetDepartment: department }),
              },
              {
                status: { in: ["pending", "processing"] },
                ...(includeAll || department === Department.FRONT_DESK
                  ? {}
                  : { targetDepartment: department }),
              },
            ],
          },
          include: { room: { select: { roomNumber: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const lowStockItems = lowStock
    .filter((item) => item.quantity <= item.reorderLevel)
    .map((item) => ({
      name: item.name,
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
    }));

  const costTotal = costs.reduce((sum, c) => sum + Number(c.amount), 0);

  const snapshot: ShiftSnapshot = {
    department,
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

  if (includeServiceRequests && serviceRequests.length > 0) {
    snapshot.serviceRequests = {
      pending: serviceRequests
        .filter((r) => r.status === "PENDING" || r.status === "CONFIRMED")
        .map((r) => ({
          title: r.title,
          guestRoom: r.guestRoom,
          guestName: r.guestName,
          scheduledAt: r.scheduledAt.toISOString(),
        })),
      handled: serviceRequests
        .filter((r) => r.status === "COMPLETED" || r.status === "REJECTED")
        .filter((r) => r.updatedAt >= shiftStart && r.updatedAt < shiftEnd)
        .map((r) => ({
          title: r.title,
          guestRoom: r.guestRoom,
          status: r.status,
        })),
    };
  }

  if (guestRequests.length > 0) {
    snapshot.guestRequests = {
      pending: guestRequests
        .filter((r) => r.status !== "completed")
        .map((r) => ({
          roomNumber: r.room.roomNumber,
          requestLabel: isGuestRequestType(r.requestType)
            ? GUEST_REQUEST_LABELS[r.requestType]
            : r.requestType,
          createdAt: r.createdAt.toISOString(),
        })),
      handled: guestRequests
        .filter((r) => r.status === "completed")
        .map((r) => ({
          roomNumber: r.room.roomNumber,
          requestLabel: isGuestRequestType(r.requestType)
            ? GUEST_REQUEST_LABELS[r.requestType]
            : r.requestType,
          status: r.status,
        })),
    };
  }

  return snapshot;
}
