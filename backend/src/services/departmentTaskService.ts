import {
  Department,
  ServiceRequestStatus,
  ServiceRequestType,
  TicketPriority,
  TicketStatus,
  UserRole,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { saveServiceRequestPhoto } from "../lib/serviceRequestPhotoStorage.js";
import { prisma } from "../lib/prisma.js";
import { roleToDepartment } from "../utils/department.js";
import { canHandleDepartment } from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";
import {
  cancelDepartmentAcceptReminders,
  notifyNewDepartmentTask,
  scheduleDepartmentAcceptReminder,
} from "./departmentAcceptAlertService.js";
import { findRoomAssetByNumber } from "./lineUserResolver.js";
import { replyToLineUser } from "./lineMessagingService.js";
import { createImmediateDepartmentReminder } from "./reminderService.js";
import { createTicket, assignTicket } from "./maintenanceTicketService.js";
import { cancelTicketEscalationReminders } from "./ticketAlertService.js";
import { submitTicketReport } from "./ticketReportService.js";

const HOUSEKEEPING_SUPPLY_PATTERN = /枕頭|被子|毛巾|備品|拖鞋|牙刷|水|清潔|打掃|整理/i;

export function resolveTaskDepartment(
  category: "維修" | "清潔" | "客務",
  description: string,
): Department {
  if (category === "維修") return Department.ENGINEERING;
  if (category === "清潔") return Department.HOUSEKEEPING;
  if (HOUSEKEEPING_SUPPLY_PATTERN.test(description)) {
    return Department.HOUSEKEEPING;
  }
  return Department.FRONT_DESK;
}

/** 建立部門任務（不指定個人，推播部門 + 5 分鐘接單 SLA） */
export async function createDepartmentTaskFromLine(params: {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  triggeredByName: string;
  roomNumber: string;
  category: "維修" | "清潔" | "客務";
  title: string;
  description: string;
}): Promise<string> {
  const department = resolveTaskDepartment(params.category, params.description);
  const room = params.roomNumber.trim() || "—";

  if (department === Department.ENGINEERING) {
    const asset = await findRoomAssetByNumber(params.tenantId, room);
    if (!asset) {
      throw new Error(`找不到 ${room} 號房資產`);
    }

    const result = await createTicket(
      params.tenantId,
      params.userId,
      {
        assetId: asset.id,
        title: params.title,
        description: params.description,
        priority: TicketPriority.MEDIUM,
      },
      { departmentOnly: true },
    );

    return `工程任務：${result.ticket.title}（已通知工程部，請回覆「接單」）`;
  }

  const scheduledAt = new Date();
  const request = await prisma.serviceRequest.create({
    data: {
      tenantId: params.tenantId,
      type: ServiceRequestType.GENERAL,
      status: ServiceRequestStatus.PENDING,
      title: params.title,
      description: params.description,
      guestRoom: room,
      guestName: "住客",
      targetDepartment: department,
      sourceDepartment: roleToDepartment(params.userRole),
      createdById: params.userId,
      scheduledAt,
      source: "line",
    },
  });

  await notifyNewDepartmentTask({
    tenantId: params.tenantId,
    department,
    roomNumber: room,
    title: params.title,
    description: params.description,
    triggeredByName: params.triggeredByName,
    sourceDepartment: roleToDepartment(params.userRole),
  });

  await scheduleDepartmentAcceptReminder({
    tenantId: params.tenantId,
    department,
    serviceRequestId: request.id,
    title: params.title,
    message: `${room} 號房「${params.title}」尚無人接單`,
  });

  const deptLabel =
    department === Department.HOUSEKEEPING ? "房務部" : "客務部";
  return `${deptLabel}任務：${params.title}（已通知部門，請回覆「接單」）`;
}

/** 接單指定服務請求（網站 / LINE 共用） */
export async function acceptServiceRequestById(
  tenantId: string,
  userId: string,
  role: UserRole,
  requestId: string,
) {
  const request = await prisma.serviceRequest.findFirst({
    where: withTenantScope(tenantId, { id: requestId }),
  });

  if (!request) {
    throw new AppError(404, "找不到服務請求");
  }

  if (request.status !== ServiceRequestStatus.PENDING || request.handledById) {
    throw new AppError(400, "此任務已被接單或已結案");
  }

  if (!canHandleDepartment(role, request.targetDepartment) && role !== UserRole.ADMIN) {
    throw new AppError(403, "您無法接此部門的任務");
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: requestId },
    data: {
      handledById: userId,
      acceptedAt: new Date(),
      status: ServiceRequestStatus.CONFIRMED,
    },
    include: {
      createdBy: { select: { id: true, name: true, role: true } },
      handledBy: { select: { id: true, name: true, role: true } },
    },
  });

  await cancelDepartmentAcceptReminders({ serviceRequestId: requestId });

  return updated;
}

/** 完成服務請求並上傳照片（網站 / LINE 共用） */
export async function completeServiceRequestById(
  tenantId: string,
  userId: string,
  role: UserRole,
  requestId: string,
  photoBuffer: Buffer | null,
  mimeType: string | null,
  note?: string,
) {
  const existing = await prisma.serviceRequest.findFirst({
    where: withTenantScope(tenantId, { id: requestId }),
  });

  if (!existing) {
    throw new AppError(404, "找不到服務請求");
  }

  if (existing.status !== ServiceRequestStatus.CONFIRMED) {
    throw new AppError(400, "僅進行中的任務可以結案");
  }

  if (existing.handledById !== userId && role !== UserRole.ADMIN) {
    throw new AppError(403, "僅接單人可以結案此任務");
  }

  const photoRequired = existing.targetDepartment !== Department.HOUSEKEEPING;
  if (photoRequired && !photoBuffer) {
    throw new AppError(400, "請上傳完成照片");
  }

  const responseNote = note?.trim() || "已完成";
  const photoUrl =
    photoBuffer && mimeType
      ? await saveServiceRequestPhoto(tenantId, requestId, photoBuffer, mimeType)
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: ServiceRequestStatus.COMPLETED,
        responseNote,
        completionPhotoUrl: photoUrl,
        confirmedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        handledBy: { select: { id: true, name: true, role: true } },
      },
    });

    await createImmediateDepartmentReminder(tx, {
      tenantId,
      serviceRequestId: requestId,
      title: `任務已完成：${req.title}`,
      message: `${req.guestRoom} 號房「${req.title}」已由部門完成。${responseNote}`,
      notifyDepartment: Department.FRONT_DESK,
    });

    return req;
  });

  return updated;
}

/** 工程師接單（網站 / LINE 共用） */
export async function acceptEngineeringTicketById(
  tenantId: string,
  userId: string,
  role: UserRole,
  ticketId: string,
) {
  if (role !== UserRole.ENGINEER && role !== UserRole.ADMIN) {
    throw new AppError(403, "僅工程師可以接工程工單");
  }

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: withTenantScope(tenantId, { id: ticketId }),
    include: { asset: { select: { code: true } } },
  });

  if (!ticket) {
    throw new AppError(404, "找不到工單");
  }

  if (ticket.status !== TicketStatus.OPEN || ticket.assignedToId) {
    throw new AppError(400, "此工單已被接單或已結案");
  }

  if (role === UserRole.ENGINEER) {
    await assignTicket(tenantId, ticketId, userId);
    await prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.IN_PROGRESS },
    });
  } else {
    await assignTicket(tenantId, ticketId, userId);
  }

  await cancelDepartmentAcceptReminders({ maintenanceTicketId: ticketId });
  await cancelTicketEscalationReminders(ticketId);

  return ticket;
}

/** LINE「接單」— 部門同仁認領最舊的待接單任務 */
export async function acceptDepartmentTaskForUser(params: {
  tenantId: string;
  userId: string;
  role: UserRole;
  lineUserId: string;
}): Promise<string> {
  const dept = roleToDepartment(params.role);

  if (params.role === UserRole.ENGINEER) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: withTenantScope(params.tenantId, {
        status: TicketStatus.OPEN,
        assignedToId: null,
      }),
      include: { asset: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (ticket) {
      await acceptEngineeringTicketById(
        params.tenantId,
        params.userId,
        params.role,
        ticket.id,
      );
      return `已接單：${ticket.asset.code} ${ticket.title}\n請完成後傳照片並回覆「完成」。`;
    }
  }

  if (!canHandleDepartment(params.role, dept) && params.role !== UserRole.ADMIN) {
    throw new AppError(403, "您的部門無法接此類任務");
  }

  const targetDept = params.role === UserRole.ADMIN ? undefined : dept;

  const request = await prisma.serviceRequest.findFirst({
    where: withTenantScope(params.tenantId, {
      status: ServiceRequestStatus.PENDING,
      handledById: null,
      ...(targetDept ? { targetDepartment: targetDept } : {}),
    }),
    orderBy: { createdAt: "asc" },
  });

  if (!request) {
    return "目前沒有待接單的部門任務。";
  }

  const accepted = await acceptServiceRequestById(
    params.tenantId,
    params.userId,
    params.role,
    request.id,
  );

  return `已接單：${accepted.guestRoom} 號房 ${accepted.title}\n請完成後傳照片並回覆「完成」。`;
}

/** LINE「完成」+ 照片 — 結案部門任務 */
export async function completeDepartmentTaskForUser(params: {
  tenantId: string;
  userId: string;
  role: UserRole;
  lineUserId: string;
  photoBuffer?: Buffer;
  photoMimeType?: string;
  note?: string;
}): Promise<string> {
  const note = params.note?.trim() || "已完成";

  const inProgressRequest = await prisma.serviceRequest.findFirst({
    where: withTenantScope(params.tenantId, {
      handledById: params.userId,
      status: ServiceRequestStatus.CONFIRMED,
    }),
    orderBy: { acceptedAt: "desc" },
  });

  if (inProgressRequest) {
    const photoRequired =
      inProgressRequest.targetDepartment !== Department.HOUSEKEEPING;
    if (photoRequired && !params.photoBuffer) {
      throw new AppError(400, "請先傳送完成照片，再回覆「完成」");
    }

    await completeServiceRequestById(
      params.tenantId,
      params.userId,
      params.role,
      inProgressRequest.id,
      params.photoBuffer ?? null,
      params.photoMimeType ?? null,
      note,
    );

    void replyToLineUser(
      params.lineUserId,
      `✅ 已完成並通知客務部\n📍 ${inProgressRequest.guestRoom} 號房\n📋 ${inProgressRequest.title}`,
    );

    return `已完成：${inProgressRequest.guestRoom} 號房 ${inProgressRequest.title}`;
  }

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: withTenantScope(params.tenantId, {
      assignedToId: params.userId,
      status: { in: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS] },
    }),
    orderBy: { assignedAt: "desc" },
  });

  if (ticket) {
    if (!params.photoBuffer) {
      throw new AppError(400, "請先傳送完成照片，再回覆「完成」");
    }

    if (ticket.status === TicketStatus.ASSIGNED) {
      await prisma.maintenanceTicket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    const base64 = params.photoBuffer.toString("base64");
    await submitTicketReport(
      params.tenantId,
      ticket.id,
      { id: params.userId, role: params.role },
      {
        type: "COMPLETED",
        note,
        photos: [{ data: base64, mimeType: params.photoMimeType ?? "image/jpeg" }],
      },
    );

    return `工程任務已完成：${ticket.title}`;
  }

  throw new AppError(404, "找不到您進行中的任務，請先回覆「接單」");
}

/** 暫存使用者剛傳的完成照片（下一步回覆「完成」時使用） */
const pendingPhotos = new Map<string, { buffer: Buffer; mimeType: string; at: number }>();

export function storePendingCompletionPhoto(
  lineUserId: string,
  buffer: Buffer,
  mimeType: string,
): void {
  pendingPhotos.set(lineUserId, { buffer, mimeType, at: Date.now() });
  setTimeout(() => pendingPhotos.delete(lineUserId), 10 * 60 * 1000);
}

export function takePendingCompletionPhoto(
  lineUserId: string,
): { buffer: Buffer; mimeType: string } | null {
  const item = pendingPhotos.get(lineUserId);
  if (!item) return null;
  pendingPhotos.delete(lineUserId);
  return { buffer: item.buffer, mimeType: item.mimeType };
}
