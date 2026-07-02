import { Department, ReminderStatus, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { roleToDepartment } from "../utils/department.js";
import {
  GUEST_REQUEST_LABELS,
  isGuestRequestType,
} from "../utils/guestRequestType.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { notifyGuestRequestOverdue } from "./lineMessagingService.js";

const REMINDER_INCLUDE = {
  serviceRequest: {
    select: {
      id: true,
      title: true,
      guestRoom: true,
      guestName: true,
      scheduledAt: true,
      status: true,
      responseNote: true,
    },
  },
  maintenanceTicket: {
    select: {
      id: true,
      title: true,
      status: true,
      resolutionNote: true,
      asset: { select: { code: true, name: true } },
    },
  },
  guestRequest: {
    select: {
      id: true,
      requestType: true,
      status: true,
      targetDepartment: true,
      room: { select: { roomNumber: true } },
      hotel: { select: { name: true, lineOfficialToken: true } },
    },
  },
};

type ReminderRow = {
  id: string;
  title: string;
  message: string;
  remindAt: Date;
  status: ReminderStatus;
  notifyDepartment: string;
  triggeredAt: Date | null;
  dismissedAt: Date | null;
  createdAt: Date;
  guestRequestId: string | null;
  serviceRequest: {
    id: string;
    title: string;
    guestRoom: string;
    guestName: string;
    scheduledAt: Date;
    status: string;
    responseNote: string | null;
  } | null;
  maintenanceTicket: {
    id: string;
    title: string;
    status: string;
    resolutionNote: string | null;
    asset: { code: string; name: string };
  } | null;
  guestRequest: {
    id: string;
    requestType: string;
    status: string;
    targetDepartment: string;
    room: { roomNumber: string };
    hotel: { name: string; lineOfficialToken: string | null };
  } | null;
};

function serializeReminder(r: ReminderRow) {
  return {
    id: r.id,
    title: r.title,
    message: r.message,
    remindAt: r.remindAt.toISOString(),
    status: r.status,
    notifyDepartment: r.notifyDepartment,
    triggeredAt: r.triggeredAt?.toISOString() ?? null,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    serviceRequest: r.serviceRequest
      ? { ...r.serviceRequest, scheduledAt: r.serviceRequest.scheduledAt.toISOString() }
      : null,
    maintenanceTicket: r.maintenanceTicket,
    guestRequest: r.guestRequest
      ? {
          id: r.guestRequest.id,
          requestType: r.guestRequest.requestType,
          status: r.guestRequest.status,
          targetDepartment: r.guestRequest.targetDepartment,
          roomNumber: r.guestRequest.room.roomNumber,
          hotelName: r.guestRequest.hotel.name,
        }
      : null,
  };
}

/** 建立立即觸發的部門提醒 */
export async function createImmediateDepartmentReminder(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  data: {
    tenantId: string;
    title: string;
    message: string;
    notifyDepartment: Department;
    serviceRequestId?: string;
    maintenanceTicketId?: string;
    guestRequestId?: string;
  },
) {
  const now = new Date();
  return tx.reminder.create({
    data: {
      tenantId: data.tenantId,
      title: data.title,
      message: data.message,
      notifyDepartment: data.notifyDepartment,
      serviceRequestId: data.serviceRequestId,
      maintenanceTicketId: data.maintenanceTicketId,
      guestRequestId: data.guestRequestId,
      remindAt: now,
      status: ReminderStatus.TRIGGERED,
      triggeredAt: now,
    },
  });
}

/** 排程未來提醒（如住客請求 30 分鐘 SLA） */
export async function createScheduledDepartmentReminder(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  data: {
    tenantId: string;
    title: string;
    message: string;
    notifyDepartment: Department;
    remindAt: Date;
    guestRequestId?: string;
    serviceRequestId?: string;
  },
) {
  return tx.reminder.create({
    data: {
      tenantId: data.tenantId,
      title: data.title,
      message: data.message,
      notifyDepartment: data.notifyDepartment,
      guestRequestId: data.guestRequestId,
      serviceRequestId: data.serviceRequestId,
      remindAt: data.remindAt,
      status: ReminderStatus.SCHEDULED,
    },
  });
}

export async function cancelGuestRequestReminders(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  guestRequestId: string,
) {
  await tx.reminder.updateMany({
    where: {
      guestRequestId,
      status: { in: [ReminderStatus.SCHEDULED, ReminderStatus.TRIGGERED] },
    },
    data: { status: ReminderStatus.CANCELLED },
  });
}

/** 觸發到期提醒並回傳給對應部門 */
export async function getActiveReminders(tenantId: string, role: UserRole) {
  const now = new Date();
  const dept = roleToDepartment(role);

  const dueWhere = withTenantScope(tenantId, {
    status: ReminderStatus.SCHEDULED,
    remindAt: { lte: now },
    ...(role === UserRole.ADMIN ? {} : { notifyDepartment: dept }),
  });

  const dueReminders = await prisma.reminder.findMany({
    where: dueWhere,
    include: REMINDER_INCLUDE,
  });

  if (dueReminders.length > 0) {
    await prisma.reminder.updateMany({
      where: { id: { in: dueReminders.map((r) => r.id) } },
      data: { status: ReminderStatus.TRIGGERED, triggeredAt: now },
    });

    for (const r of dueReminders) {
      if (!r.guestRequestId || !r.guestRequest || r.guestRequest.status === "completed") {
        continue;
      }
      const type = isGuestRequestType(r.guestRequest.requestType)
        ? r.guestRequest.requestType
        : "other";
      void notifyGuestRequestOverdue({
        tenantId,
        hotelName: r.guestRequest.hotel.name,
        roomNumber: r.guestRequest.room.roomNumber,
        requestLabel: GUEST_REQUEST_LABELS[type],
        department: r.guestRequest.targetDepartment as Department,
        lineOfficialToken: r.guestRequest.hotel.lineOfficialToken,
      });
    }
  }

  const reminders = await prisma.reminder.findMany({
    where: withTenantScope(tenantId, {
      status: ReminderStatus.TRIGGERED,
      ...(role === UserRole.ADMIN ? {} : { notifyDepartment: dept }),
    }),
    orderBy: { remindAt: "asc" },
    include: REMINDER_INCLUDE,
  });

  return reminders.map((r) => serializeReminder(r as ReminderRow));
}

export async function dismissReminder(
  tenantId: string,
  role: UserRole,
  reminderId: string,
) {
  const reminder = await prisma.reminder.findFirst({
    where: withTenantScope(tenantId, { id: reminderId }),
    include: REMINDER_INCLUDE,
  });

  if (!reminder) {
    throw new AppError(404, "找不到提醒");
  }

  const dept = roleToDepartment(role);
  if (role !== UserRole.ADMIN && reminder.notifyDepartment !== dept) {
    throw new AppError(403, "無法處理此提醒");
  }

  const updated = await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      status: ReminderStatus.DISMISSED,
      dismissedAt: new Date(),
    },
    include: REMINDER_INCLUDE,
  });

  return serializeReminder(updated as ReminderRow);
}

export async function listUpcomingReminders(tenantId: string, role: UserRole) {
  const dept = roleToDepartment(role);

  const reminders = await prisma.reminder.findMany({
    where: withTenantScope(tenantId, {
      status: { in: [ReminderStatus.SCHEDULED, ReminderStatus.TRIGGERED] },
      ...(role === UserRole.ADMIN ? {} : { notifyDepartment: dept }),
    }),
    orderBy: { remindAt: "asc" },
    take: 20,
    include: REMINDER_INCLUDE,
  });

  return reminders.map((r) => serializeReminder(r as ReminderRow));
}
