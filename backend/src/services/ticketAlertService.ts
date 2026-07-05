import { Department, ReminderStatus, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { notifyTicketCreated, notifyTicketEscalated } from "./lineMessagingService.js";

const ESCALATION_MINUTES = Number(process.env.TICKET_ESCALATION_MINUTES ?? 15);

export function getTicketEscalationMinutes(): number {
  return Number.isFinite(ESCALATION_MINUTES) && ESCALATION_MINUTES > 0
    ? ESCALATION_MINUTES
    : 15;
}

interface TicketNotifyContext {
  tenantId: string;
  ticket: {
    id: string;
    title: string;
    description: string | null;
    priority: TicketPriority;
    asset: { code: string; name: string };
  };
  triggeredByName: string;
  autoDispatched: boolean;
  assigneeName?: string | null;
}

/** 新工單建立後：LINE 推播工程部 + 排程逾時升級 */
export async function handleMaintenanceTicketCreated(ctx: TicketNotifyContext): Promise<void> {
  void notifyTicketCreated({
    tenantId: ctx.tenantId,
    ticketId: ctx.ticket.id,
    title: ctx.ticket.title,
    description: ctx.ticket.description,
    priority: ctx.ticket.priority,
    assetCode: ctx.ticket.asset.code,
    assetName: ctx.ticket.asset.name,
    triggeredByName: ctx.triggeredByName,
    autoDispatched: ctx.autoDispatched,
    assigneeName: ctx.assigneeName,
  });

  if (!ctx.autoDispatched) {
    await scheduleTicketEscalationReminder(ctx.tenantId, ctx.ticket);
  }
}

async function scheduleTicketEscalationReminder(
  tenantId: string,
  ticket: TicketNotifyContext["ticket"],
): Promise<void> {
  const minutes = getTicketEscalationMinutes();
  const remindAt = new Date(Date.now() + minutes * 60 * 1000);

  await prisma.reminder.create({
    data: {
      tenantId,
      maintenanceTicketId: ticket.id,
      title: `工單逾時未接單：${ticket.asset.code}`,
      message: `${ticket.asset.code} ${ticket.title} 已超過 ${minutes} 分鐘無工程師接單，請管理層協調派工。`,
      notifyDepartment: Department.MANAGEMENT,
      remindAt,
      status: ReminderStatus.SCHEDULED,
    },
  });
}

/** 工單已派單或結案時，取消待觸發的升級提醒 */
export async function cancelTicketEscalationReminders(ticketId: string): Promise<void> {
  await prisma.reminder.updateMany({
    where: {
      maintenanceTicketId: ticketId,
      status: ReminderStatus.SCHEDULED,
    },
    data: { status: ReminderStatus.CANCELLED },
  });
}

/** 處理到期且仍無人接單的工單升級提醒 */
export async function processDueTicketEscalations(): Promise<number> {
  const now = new Date();
  const minutes = getTicketEscalationMinutes();

  const dueReminders = await prisma.reminder.findMany({
    where: {
      status: ReminderStatus.SCHEDULED,
      maintenanceTicketId: { not: null },
      remindAt: { lte: now },
    },
    include: {
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
    const ticket = reminder.maintenanceTicket;
    if (!ticket) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.CANCELLED },
      });
      continue;
    }

    const stillUnassigned =
      ticket.status === TicketStatus.OPEN && ticket.assignedToId == null;

    if (!stillUnassigned) {
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

    void notifyTicketEscalated({
      tenantId: reminder.tenantId,
      ticketId: ticket.id,
      title: ticket.title,
      assetCode: ticket.asset.code,
      assetName: ticket.asset.name,
      triggeredByName: ticket.triggeredBy.name,
      minutesOverdue: minutes,
    });

    processed += 1;
  }

  return processed;
}
