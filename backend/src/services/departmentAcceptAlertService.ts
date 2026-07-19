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
      status: { in: [ReminderStatus.SCHEDULED, ReminderStatus.TRIGGERED] },
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

/** 新部門任務建立時推播：接受部門收「請接單」，送出部門收「已送出」確認（不含 ADMIN 廣播） */
export async function notifyNewDepartmentTask(params: {
  tenantId: string;
  department: Department;
  roomNumber: string;
  title: string;
  description: string;
  triggeredByName: string;
  sourceDepartment?: Department;
  acceptHint?: string;
  /** 有 ID 時推「文字 + 可點接單 Flex」；否則退回純文字 */
  serviceRequestId?: string;
}): Promise<void> {
  const deptLabel = DEPARTMENT_LABELS[params.department];

  let targetSent = 0;
  if (params.serviceRequestId) {
    // 動態 import，避免與 hotelNoticeFlexService 循環依賴
    const { pushDepartmentTaskCard } = await import(
      "./hotelNoticeFlexService.js"
    );
    const card = await pushDepartmentTaskCard({
      tenantId: params.tenantId,
      department: params.department,
      serviceRequestId: params.serviceRequestId,
      roomNumber: params.roomNumber,
      title: params.title,
      description: params.description,
      creatorName: params.triggeredByName,
    });
    targetSent = card.sent;
  } else {
    const acceptLines = [
      `📋 新${deptLabel}任務`,
      `📍 ${params.roomNumber} 號房`,
      `📝 ${params.title}`,
      `👤 通報：${params.triggeredByName}`,
    ];
    if (params.description.trim()) {
      acceptLines.push(`💬 ${params.description.trim().slice(0, 120)}`);
    }
    acceptLines.push(
      "",
      `請在 ${getDepartmentAcceptMinutes()} 分鐘內接單。`,
      params.acceptHint ?? "回覆「接單」即可認領此任務。",
    );
    const toTarget = await pushToDepartmentStaff(
      params.tenantId,
      params.department,
      acceptLines.join("\n"),
    );
    targetSent = toTarget.sent;
  }

  // 送出部門（若與接受部門不同）只收確認，避免客務部也被要求「接單」
  if (
    params.sourceDepartment &&
    params.sourceDepartment !== params.department
  ) {
    const sourceLabel = DEPARTMENT_LABELS[params.sourceDepartment];
    const confirmText = [
      `✅ 已送出${deptLabel}請求`,
      `📍 ${params.roomNumber} 號房`,
      `📝 ${params.title}`,
      `👤 通報：${params.triggeredByName}`,
      "",
      `已通知${deptLabel}接單；完成後會再通知${sourceLabel}。`,
    ].join("\n");

    await pushToDepartmentStaff(
      params.tenantId,
      params.sourceDepartment,
      confirmText,
    );
  }

  if (targetSent === 0) {
    console.warn(
      `[LINE] 新${deptLabel}任務推播未成功送達接受部門任何人。` +
        "請檢查 LINE_MESSAGING_ACCESS_TOKEN，以及該部門員工是否已用 LINE 登入並綁定。",
    );
  }
}
