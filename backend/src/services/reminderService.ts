import { Department, ReminderStatus, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { roleToDepartment } from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";

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
};

function serializeReminder(
  r: {
    id: string;
    title: string;
    message: string;
    remindAt: Date;
    status: ReminderStatus;
    notifyDepartment: string;
    triggeredAt: Date | null;
    dismissedAt: Date | null;
    createdAt: Date;
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
  },
) {
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
      ? {
          ...r.serviceRequest,
          scheduledAt: r.serviceRequest.scheduledAt.toISOString(),
        }
      : null,
    maintenanceTicket: r.maintenanceTicket,
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
      remindAt: now,
      status: ReminderStatus.TRIGGERED,
      triggeredAt: now,
    },
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

  const dueIds = await prisma.reminder.findMany({
    where: dueWhere,
    select: { id: true },
  });

  if (dueIds.length > 0) {
    await prisma.reminder.updateMany({
      where: { id: { in: dueIds.map((r) => r.id) } },
      data: { status: ReminderStatus.TRIGGERED, triggeredAt: now },
    });
  }

  const reminders = await prisma.reminder.findMany({
    where: withTenantScope(tenantId, {
      status: ReminderStatus.TRIGGERED,
      ...(role === UserRole.ADMIN ? {} : { notifyDepartment: dept }),
    }),
    orderBy: { remindAt: "asc" },
    include: REMINDER_INCLUDE,
  });

  return reminders.map(serializeReminder);
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

  return serializeReminder(updated);
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

  return reminders.map(serializeReminder);
}
