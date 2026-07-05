import { Department, ReminderStatus, ServiceRequestStatus, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { DEPARTMENT_LABELS } from "../utils/department.js";
import { notifyDepartmentAcceptOverdue, pushToDepartmentStaff } from "./lineMessagingService.js";

const ACCEPT_MINUTES = Number(process.env.DEPARTMENT_ACCEPT_MINUTES ?? 5);

export const DEPARTMENT_ACCEPT_REMINDER_TITLE = "[接單SLA]";

export function getDepartmentAcceptMinutes(): number {
  return Number.isFinite(ACCEPT_MINUTES) && ACCEPT_MINUTES > 0 ? ACCEPT_MINUTES : 5;
}

/** 排程部門接單逾時提醒（5 分鐘內須有人接單） */
export async function scheduleDepartmentAcceptReminder(params: {
  tenantId: string;
  department: Department;
  title: string;
  message: string;
  serviceRequestId?: string;
  maintenanceTicketId?: string;
}): Promise<void> {
  const minutes = getDepartmentAcceptMinutes();
  const remindAt = new Date(Date.now() + minutes * 60 * 1000);

  await prisma.reminder.create({
    data: {
      tenantId: params.tenantId,
      serviceRequestId: params.serviceRequestId,
      maintenanceTicketId: params.maintenanceTicketId,
      title: `${DEPARTMENT_ACCEPT_REMINDER_TITLE}${params.title}`,
      message: params.message,
      notifyDepartment: params.department,
      remindAt,
      status: ReminderStatus.SCHEDULED,
    },
  });
}

export async function cancelDepartmentAcceptReminders(params: {
  serviceRequestId?: string;
  maintenanceTicketId?: string;
}): Promise<void> {
  await prisma.reminder.updateMany({
    where: {
      ...(params.serviceRequestId
        ? { serviceRequestId: params.serviceRequestId }
        : { maintenanceTicketId: params.maintenanceTicketId }),
      status: ReminderStatus.SCHEDULED,
      title: { startsWith: DEPARTMENT_ACCEPT_REMINDER_TITLE },
    },
    data: { status: ReminderStatus.CANCELLED },
  });
}

/** 處理到期且仍無人接單的部門任務 → 再次 LINE 推播該部門 */
export async function processDueDepartmentAcceptReminders(): Promise<number> {
  const now = new Date();
  const minutes = getDepartmentAcceptMinutes();

  const dueReminders = await prisma.reminder.findMany({
    where: {
      status: ReminderStatus.SCHEDULED,
      title: { startsWith: DEPARTMENT_ACCEPT_REMINDER_TITLE },
      remindAt: { lte: now },
    },
    include: {
      serviceRequest: true,
      maintenanceTicket: {
        include: {
          asset: { select: { code: true, name: true } },
          triggeredBy: { select: { name: true } },
        },
      },
    },
  });

  let processed = 0;

  for (const reminder of dueReminders) {
    if (reminder.serviceRequest) {
      const req = reminder.serviceRequest;
      const stillWaiting =
        req.status === ServiceRequestStatus.PENDING && req.handledById == null;

      if (!stillWaiting) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.CANCELLED },
        });
        continue;
      }

      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.TRIGGERED, triggeredAt: now },
      });

      void notifyDepartmentAcceptOverdue({
        tenantId: reminder.tenantId,
        department: req.targetDepartment,
        roomNumber: req.guestRoom,
        title: req.title,
        minutesOverdue: minutes,
      });

      processed += 1;
      continue;
    }

    if (reminder.maintenanceTicket) {
      const ticket = reminder.maintenanceTicket;
      const stillWaiting =
        ticket.status === TicketStatus.OPEN && ticket.assignedToId == null;

      if (!stillWaiting) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.CANCELLED },
        });
        continue;
      }

      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.TRIGGERED, triggeredAt: now },
      });

      void notifyDepartmentAcceptOverdue({
        tenantId: reminder.tenantId,
        department: Department.ENGINEERING,
        roomNumber: ticket.asset.code,
        title: ticket.title,
        minutesOverdue: minutes,
      });

      processed += 1;
    }
  }

  return processed;
}

/** 新部門任務建立時推播該部門 */
export async function notifyNewDepartmentTask(params: {
  tenantId: string;
  department: Department;
  roomNumber: string;
  title: string;
  description: string;
  triggeredByName: string;
  acceptHint?: string;
}): Promise<void> {
  const deptLabel = DEPARTMENT_LABELS[params.department];
  const lines = [
    `📋 新${deptLabel}任務`,
    `📍 ${params.roomNumber} 號房`,
    `📝 ${params.title}`,
    `👤 通報：${params.triggeredByName}`,
  ];

  if (params.description.trim()) {
    lines.push(`💬 ${params.description.trim().slice(0, 120)}`);
  }

  lines.push(
    "",
    `請在 ${getDepartmentAcceptMinutes()} 分鐘內接單。`,
    params.acceptHint ?? "回覆「接單」即可認領此任務。",
  );

  await pushToDepartmentStaff(params.tenantId, params.department, lines.join("\n"));
}
