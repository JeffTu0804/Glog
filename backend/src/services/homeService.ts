import {
  Department,
  HandoverItemType,
  ServiceRequestStatus,
  ShiftLogbookStatus,
  TicketStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import {
  canAccessDepartment,
  roleToDepartment,
} from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { listGuestRequestsForTenant } from "./guestRequestService.js";
import {
  getLatestPublishedLogbook,
  getOrCreateCurrentLogbook,
} from "./logbookService.js";
import { formatShiftWindow } from "./shiftService.js";

export interface HomeTodoItem {
  id: string;
  kind: "guest_request" | "service_request" | "maintenance_ticket" | "reminder";
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
}

export interface HandoverAckItem {
  itemType: HandoverItemType;
  itemIndex: number;
  completedAt: string;
  completedBy: { id: string; name: string };
}

function departmentHref(department: Department): string {
  switch (department) {
    case Department.FOOD_BEVERAGE:
      return "/food-beverage";
    case Department.HOUSEKEEPING:
      return "/housekeeping";
    case Department.ENGINEERING:
      return "/engineering";
    default:
      return "/guest-requests";
  }
}

function departmentsForRole(role: UserRole): Department[] {
  if (role === UserRole.ADMIN) {
    return Object.values(Department);
  }
  return [roleToDepartment(role)];
}

async function collectTodos(
  tenantId: string,
  role: UserRole,
): Promise<HomeTodoItem[]> {
  const todos: HomeTodoItem[] = [];
  const departments = departmentsForRole(role);

  const guestRequests = await listGuestRequestsForTenant(tenantId, role, {
    view: "inbox",
  });
  for (const req of guestRequests) {
    if (req.status === "completed") continue;
    todos.push({
      id: `guest-${req.id}`,
      kind: "guest_request",
      title: `${req.room_number} 號房 · ${req.request_label}`,
      subtitle: `客人請求 · ${req.status === "processing" ? "處理中" : "待處理"}`,
      href: "/guest-requests",
      createdAt: req.created_at,
    });
  }

  const serviceWhere: Prisma.ServiceRequestWhereInput = {
    tenantId,
    status: ServiceRequestStatus.PENDING,
    handledById: null,
    targetDepartment: role === UserRole.ADMIN ? undefined : { in: departments },
  };

  const serviceRequests = await prisma.serviceRequest.findMany({
    where: serviceWhere,
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });

  for (const req of serviceRequests) {
    todos.push({
      id: `service-${req.id}`,
      kind: "service_request",
      title: req.title,
      subtitle: `${req.guestRoom} 號房 · ${req.guestName}`,
      href: departmentHref(req.targetDepartment),
      createdAt: req.createdAt.toISOString(),
    });
  }

  if (role === UserRole.ENGINEER || role === UserRole.ADMIN) {
    const tickets = await prisma.maintenanceTicket.findMany({
      where: withTenantScope(tenantId, {
        status: {
          in: [
            TicketStatus.OPEN,
            TicketStatus.ASSIGNED,
            TicketStatus.IN_PROGRESS,
          ],
        },
      }),
      include: { asset: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const ticket of tickets) {
      todos.push({
        id: `ticket-${ticket.id}`,
        kind: "maintenance_ticket",
        title: ticket.title,
        subtitle: `${ticket.asset.code} · 工程工單`,
        href: `/tickets/${ticket.id}`,
        createdAt: ticket.createdAt.toISOString(),
      });
    }
  }

  const confirmedRequests = await prisma.serviceRequest.findMany({
    where: withTenantScope(tenantId, {
      status: ServiceRequestStatus.CONFIRMED,
      acceptedAt: { not: null },
      completionPhotoUrl: null,
      targetDepartment:
        role === UserRole.ADMIN ? undefined : { in: departments },
    }),
    orderBy: { scheduledAt: "asc" },
    take: 10,
  });

  for (const req of confirmedRequests) {
    todos.push({
      id: `service-active-${req.id}`,
      kind: "service_request",
      title: `${req.title}（進行中）`,
      subtitle: `${req.guestRoom} 號房 · 待完工`,
      href: departmentHref(req.targetDepartment),
      createdAt: req.acceptedAt!.toISOString(),
    });
  }

  todos.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return todos;
}

async function getHandoverAcks(logbookId: string): Promise<HandoverAckItem[]> {
  const acks = await prisma.shiftHandoverAck.findMany({
    where: { sourceLogbookId: logbookId },
    include: { completedBy: { select: { id: true, name: true } } },
    orderBy: [{ itemType: "asc" }, { itemIndex: "asc" }],
  });

  return acks.map((ack) => ({
    itemType: ack.itemType,
    itemIndex: ack.itemIndex,
    completedAt: ack.completedAt.toISOString(),
    completedBy: ack.completedBy,
  }));
}

export async function getHomeData(
  tenantId: string,
  userId: string,
  role: UserRole,
) {
  const department = roleToDepartment(role);

  const [{ shift }, previousHandover, todos] = await Promise.all([
    getOrCreateCurrentLogbook(tenantId, userId, department),
    getLatestPublishedLogbook(tenantId, department),
    collectTodos(tenantId, role),
  ]);

  const handoverAcks = previousHandover
    ? await getHandoverAcks(previousHandover.id)
    : [];

  return {
    department,
    shift: {
      label: shift.label,
      window: formatShiftWindow(shift.shiftStart, shift.shiftEnd),
    },
    todos,
    previousHandover,
    handoverAcks,
  };
}

export async function toggleHandoverAck(
  tenantId: string,
  userId: string,
  role: UserRole,
  input: {
    logbookId: string;
    itemType: HandoverItemType;
    itemIndex: number;
    completed: boolean;
  },
) {
  const logbook = await prisma.shiftLogbook.findFirst({
    where: withTenantScope(tenantId, {
      id: input.logbookId,
      status: ShiftLogbookStatus.PUBLISHED,
    }),
  });

  if (!logbook) {
    throw new AppError(404, "找不到交班紀錄");
  }

  if (!canAccessDepartment(role, logbook.department)) {
    throw new AppError(403, "無權限確認此部門交班事項");
  }

  const items =
    input.itemType === HandoverItemType.HIGHLIGHT
      ? logbook.highlights
      : logbook.openItems;

  if (input.itemIndex < 0 || input.itemIndex >= items.length) {
    throw new AppError(400, "項目索引無效");
  }

  const uniqueKey = {
    sourceLogbookId: input.logbookId,
    itemType: input.itemType,
    itemIndex: input.itemIndex,
  };

  if (input.completed) {
    await prisma.shiftHandoverAck.upsert({
      where: { sourceLogbookId_itemType_itemIndex: uniqueKey },
      create: {
        tenantId,
        sourceLogbookId: input.logbookId,
        itemType: input.itemType,
        itemIndex: input.itemIndex,
        completedById: userId,
      },
      update: {
        completedById: userId,
        completedAt: new Date(),
      },
    });
  } else {
    await prisma.shiftHandoverAck.deleteMany({
      where: uniqueKey,
    });
  }

  return getHandoverAcks(input.logbookId);
}
