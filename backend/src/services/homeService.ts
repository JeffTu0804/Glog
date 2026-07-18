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
import { listActiveMemos, type HotelNoticeDto } from "./hotelNoticeService.js";
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
  /** 房號（供前端放大顯示） */
  roomNumber?: string | null;
  /** 待處理 | 進行中 */
  todoStatus?: "pending" | "in_progress";
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
      title: req.request_label,
      subtitle: "客人請求",
      href: "/guest-requests",
      createdAt: req.created_at,
      roomNumber: req.room_number,
      todoStatus: req.status === "processing" ? "in_progress" : "pending",
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
      subtitle: req.guestName,
      href: departmentHref(req.targetDepartment),
      createdAt: req.createdAt.toISOString(),
      roomNumber: req.guestRoom,
      todoStatus: "pending",
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
      const inProgress =
        ticket.status === TicketStatus.ASSIGNED ||
        ticket.status === TicketStatus.IN_PROGRESS;
      todos.push({
        id: `ticket-${ticket.id}`,
        kind: "maintenance_ticket",
        title: ticket.title,
        subtitle: "工程工單",
        href: `/tickets/${ticket.id}`,
        createdAt: ticket.createdAt.toISOString(),
        roomNumber: ticket.asset.code,
        todoStatus: inProgress ? "in_progress" : "pending",
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
      title: req.title,
      subtitle: "待完工",
      href: departmentHref(req.targetDepartment),
      createdAt: req.acceptedAt!.toISOString(),
      roomNumber: req.guestRoom,
      todoStatus: "in_progress",
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

  const [{ shift }, previousHandover, todos, activeMemos] = await Promise.all([
    getOrCreateCurrentLogbook(tenantId, userId, department),
    getLatestPublishedLogbook(tenantId, department),
    collectTodos(tenantId, role),
    listActiveMemos(tenantId),
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
    activeMemos: activeMemos as HotelNoticeDto[],
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
