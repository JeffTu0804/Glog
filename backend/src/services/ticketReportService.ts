import {
  Department,
  ReminderStatus,
  TicketAttachmentKind,
  TicketResolutionType,
  TicketStatus,
  UserRole,
  UserStatus,
  type Prisma,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { saveTicketPhotos, type PhotoInput } from "../lib/photoStorage.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { TICKET_INCLUDE, findTicketForTenant } from "./maintenanceTicketService.js";

export type TicketReportType = "COMPLETED" | "NEEDS_FRONT_DESK";

export interface SubmitTicketReportInput {
  type: TicketReportType;
  note: string;
  photos: PhotoInput[];
}

function attachmentKind(type: TicketReportType): TicketAttachmentKind {
  return type === "COMPLETED"
    ? TicketAttachmentKind.COMPLETION
    : TicketAttachmentKind.ESCALATION;
}

function nextStatus(type: TicketReportType): TicketStatus {
  return type === "COMPLETED"
    ? TicketStatus.COMPLETED
    : TicketStatus.PENDING_FRONT_DESK;
}

function resolutionType(type: TicketReportType): TicketResolutionType {
  return type === "COMPLETED"
    ? TicketResolutionType.COMPLETED
    : TicketResolutionType.NEEDS_FRONT_DESK;
}

async function createTriggeredReminder(
  tx: Prisma.TransactionClient,
  data: {
    tenantId: string;
    maintenanceTicketId: string;
    title: string;
    message: string;
    notifyDepartment: Department;
  },
) {
  const now = new Date();
  return tx.reminder.create({
    data: {
      ...data,
      remindAt: now,
      status: ReminderStatus.TRIGGERED,
      triggeredAt: now,
    },
  });
}

export async function submitTicketReport(
  tenantId: string,
  ticketId: string,
  actor: { id: string; role: UserRole },
  input: SubmitTicketReportInput,
) {
  if (actor.role !== UserRole.ENGINEER && actor.role !== UserRole.ADMIN) {
    throw new AppError(403, "僅工程師可提交現場回報");
  }

  const note = input.note.trim();
  if (!note) {
    throw new AppError(400, "請填寫回報說明");
  }

  const ticket = await findTicketForTenant(tenantId, ticketId);

  if (actor.role === UserRole.ENGINEER && ticket.assignedToId !== actor.id) {
    throw new AppError(403, "僅能回報指派給自己的工單");
  }

  if (ticket.status !== TicketStatus.IN_PROGRESS) {
    throw new AppError(400, "僅進行中的工單可提交現場回報");
  }

  const roomLabel = `${ticket.asset.code} 號房`;
  const urls = await saveTicketPhotos(tenantId, ticket.id, input.photos);
  const now = new Date();
  const kind = attachmentKind(input.type);
  const status = nextStatus(input.type);

  const updated = await prisma.$transaction(async (tx) => {
    for (let i = 0; i < urls.length; i++) {
      await tx.ticketAttachment.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          uploadedById: actor.id,
          url: urls[i]!,
          mimeType: input.photos[i]?.mimeType ?? "image/jpeg",
          kind,
        },
      });
    }

    const updatedTicket = await tx.maintenanceTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        resolutionNote: note,
        resolutionType: resolutionType(input.type),
        resolutionAt: now,
        ...(input.type === "COMPLETED" ? { completedAt: now } : {}),
      },
      include: TICKET_INCLUDE,
    });

    if (input.type === "COMPLETED" && ticket.assignedToId) {
      await tx.user.update({
        where: { id: ticket.assignedToId },
        data: { status: UserStatus.IDLE },
      });
    }

    const roomLabel = `${ticket.asset.code} 號房`;
    if (input.type === "COMPLETED") {
      await createTriggeredReminder(tx, {
        tenantId,
        maintenanceTicketId: ticket.id,
        title: `工程完工：${ticket.title}`,
        message: `${roomLabel} 工程師已完工並上傳照片。說明：${note}。請確認現場並通知相關人員。`,
        notifyDepartment: Department.FRONT_DESK,
      });
    } else {
      await createTriggeredReminder(tx, {
        tenantId,
        maintenanceTicketId: ticket.id,
        title: `需前台協助：${ticket.title}`,
        message: `${roomLabel} 工程師無法自行處理，請協助（換房、通知客人等）。原因：${note}`,
        notifyDepartment: Department.FRONT_DESK,
      });
    }

    return updatedTicket;
  });

  return updated;
}

export async function resolveFrontDeskEscalation(
  tenantId: string,
  ticketId: string,
  actor: { id: string; role: UserRole },
  action: "RESUME" | "CLOSE",
  note: string,
) {
  if (actor.role !== UserRole.FRONT_DESK && actor.role !== UserRole.ADMIN) {
    throw new AppError(403, "僅前台或管理員可處理此案件");
  }

  const deskNote = note.trim();
  if (!deskNote) {
    throw new AppError(400, "請填寫協調說明");
  }

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: withTenantScope(tenantId, { id: ticketId }),
  });

  if (!ticket) {
    throw new AppError(404, "找不到工單");
  }

  if (ticket.status !== TicketStatus.PENDING_FRONT_DESK) {
    throw new AppError(400, "此工單不在待前台協助狀態");
  }

  const now = new Date();

  if (action === "RESUME") {
    return prisma.maintenanceTicket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.IN_PROGRESS,
        frontDeskNote: deskNote,
      },
      include: TICKET_INCLUDE,
    });
  }

  return prisma.$transaction(async (tx) => {
    if (ticket.assignedToId) {
      await tx.user.update({
        where: { id: ticket.assignedToId },
        data: { status: UserStatus.IDLE },
      });
    }

    return tx.maintenanceTicket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.CLOSED,
        frontDeskNote: deskNote,
        closedAt: now,
      },
      include: TICKET_INCLUDE,
    });
  });
}

export function parseTicketReportBody(body: Record<string, unknown>): SubmitTicketReportInput {
  const { type, note, photos } = body;

  if (type !== "COMPLETED" && type !== "NEEDS_FRONT_DESK") {
    throw new AppError(400, "type 必須為 COMPLETED 或 NEEDS_FRONT_DESK");
  }
  if (typeof note !== "string") {
    throw new AppError(400, "note 為必填");
  }
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new AppError(400, "photos 為必填且至少一張");
  }

  const parsed: PhotoInput[] = photos.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new AppError(400, `photos[${index}] 格式無效`);
    }
    const { data, mimeType } = item as Record<string, unknown>;
    if (typeof data !== "string" || !data) {
      throw new AppError(400, `photos[${index}].data 為必填`);
    }
    return {
      data,
      mimeType: typeof mimeType === "string" ? mimeType : "image/jpeg",
    };
  });

  return { type, note, photos: parsed };
}
