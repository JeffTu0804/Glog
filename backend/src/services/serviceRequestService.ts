import {
  Department,
  ReminderStatus,
  ServiceRequestStatus,
  ServiceRequestType,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { canHandleDepartment, roleToDepartment } from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { parseEnumValue } from "../utils/validators.js";
import { createImmediateDepartmentReminder } from "./reminderService.js";
import { notifyServiceRequestCreated } from "./lineMessagingService.js";
import {
  notifyNewDepartmentTask,
  scheduleDepartmentAcceptReminder,
} from "./departmentAcceptAlertService.js";

const REQUEST_INCLUDE = {
  createdBy: { select: { id: true, name: true, role: true } },
  handledBy: { select: { id: true, name: true, role: true } },
  reminders: {
    orderBy: { remindAt: "asc" as const },
    select: {
      id: true,
      title: true,
      remindAt: true,
      status: true,
      triggeredAt: true,
    },
  },
} satisfies Prisma.ServiceRequestInclude;

export interface CreateServiceRequestInput {
  type?: ServiceRequestType;
  title: string;
  description?: string;
  guestRoom: string;
  guestName: string;
  targetDepartment: Department;
  scheduledAt: Date;
  reminderAt?: Date;
}

function parseDepartment(value: unknown): Department {
  return parseEnumValue(value, Object.values(Department), "targetDepartment");
}

function parseRequestType(value: unknown): ServiceRequestType {
  if (value === undefined) return ServiceRequestType.RESTAURANT_RESERVATION;
  return parseEnumValue(value, Object.values(ServiceRequestType), "type");
}

function serializeRequest(
  req: Prisma.ServiceRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>,
) {
  return {
    id: req.id,
    type: req.type,
    status: req.status,
    title: req.title,
    description: req.description,
    guestRoom: req.guestRoom,
    guestName: req.guestName,
    targetDepartment: req.targetDepartment,
    sourceDepartment: req.sourceDepartment,
    scheduledAt: req.scheduledAt.toISOString(),
    reminderAt: req.reminderAt?.toISOString() ?? null,
    responseNote: req.responseNote,
    confirmedAt: req.confirmedAt?.toISOString() ?? null,
    rejectedAt: req.rejectedAt?.toISOString() ?? null,
    acceptedAt: req.acceptedAt?.toISOString() ?? null,
    completionPhotoUrl: req.completionPhotoUrl ?? null,
    source: req.source,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    createdBy: req.createdBy,
    handledBy: req.handledBy,
    reminders: req.reminders.map((r) => ({
      ...r,
      remindAt: r.remindAt.toISOString(),
      triggeredAt: r.triggeredAt?.toISOString() ?? null,
    })),
  };
}

export async function createServiceRequest(
  tenantId: string,
  userId: string,
  role: UserRole,
  input: CreateServiceRequestInput,
) {
  if (input.reminderAt && input.reminderAt >= input.scheduledAt) {
    throw new AppError(400, "提醒時間必須早於預約時間");
  }

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.serviceRequest.create({
      data: {
        tenantId,
        type: input.type ?? ServiceRequestType.RESTAURANT_RESERVATION,
        title: input.title.trim(),
        description: input.description?.trim(),
        guestRoom: input.guestRoom.trim(),
        guestName: input.guestName.trim(),
        targetDepartment: input.targetDepartment,
        sourceDepartment: roleToDepartment(role),
        createdById: userId,
        scheduledAt: input.scheduledAt,
        reminderAt: input.reminderAt,
        source: "web",
      },
      include: REQUEST_INCLUDE,
    });

    if (created.type === ServiceRequestType.RESTAURANT_RESERVATION) {
      const guestLabel = `${created.guestRoom} 號房 ${created.guestName}`;
      const timeLabel = formatTaipeiTime(created.scheduledAt);
      await createImmediateDepartmentReminder(tx, {
        tenantId,
        serviceRequestId: created.id,
        title: `新預約請求：${created.title}`,
        message: `${guestLabel}，預約 ${timeLabel}。請儘快確認可否受理。`,
        notifyDepartment: Department.FOOD_BEVERAGE,
      });
    }

    return created;
  });

  if (
    request.type === ServiceRequestType.GENERAL &&
    request.targetDepartment === Department.HOUSEKEEPING
  ) {
    const creator = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { name: true },
    });

    await notifyNewDepartmentTask({
      tenantId,
      department: Department.HOUSEKEEPING,
      roomNumber: request.guestRoom,
      title: request.title,
      description: request.description ?? "",
      triggeredByName: creator?.name ?? "客務部",
    });

    await scheduleDepartmentAcceptReminder({
      tenantId,
      department: Department.HOUSEKEEPING,
      serviceRequestId: request.id,
      title: request.title,
      message: `${request.guestRoom} 號房「${request.title}」尚無人接單`,
    });
  }

  if (request.type === ServiceRequestType.RESTAURANT_RESERVATION) {
    void notifyServiceRequestCreated({
      tenantId,
      title: request.title,
      guestRoom: request.guestRoom,
      guestName: request.guestName,
      targetDepartment: request.targetDepartment,
      scheduledLabel: formatTaipeiTime(request.scheduledAt),
    });
  }

  return serializeRequest(request);
}

export async function listServiceRequests(
  tenantId: string,
  role: UserRole,
  view: "inbox" | "sent" | "all" | "active",
  userId: string,
  targetDepartment?: Department,
) {
  let where: Prisma.ServiceRequestWhereInput = withTenantScope(tenantId, {});

  if (targetDepartment) {
    where.targetDepartment = targetDepartment;
  }

  if (view === "inbox") {
    const dept = roleToDepartment(role);
    where = {
      ...where,
      status: ServiceRequestStatus.PENDING,
      handledById: null,
      ...(role === UserRole.ADMIN && !targetDepartment
        ? {}
        : { targetDepartment: targetDepartment ?? dept }),
    };
  } else if (view === "active") {
    where = {
      ...where,
      status: ServiceRequestStatus.CONFIRMED,
      handledById: userId,
    };
  } else if (view === "sent") {
    where = { ...where, createdById: userId };
  }

  const requests = await prisma.serviceRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    include: REQUEST_INCLUDE,
  });

  return requests.map(serializeRequest);
}

export async function getServiceRequest(tenantId: string, id: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: withTenantScope(tenantId, { id }),
    include: REQUEST_INCLUDE,
  });

  if (!request) {
    throw new AppError(404, "找不到服務請求");
  }

  return serializeRequest(request);
}

function formatTaipeiTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function confirmServiceRequest(
  tenantId: string,
  userId: string,
  role: UserRole,
  id: string,
  responseNote?: string,
) {
  const note = responseNote?.trim() ?? "";

  const existing = await prisma.serviceRequest.findFirst({
    where: withTenantScope(tenantId, { id }),
  });

  if (!existing) {
    throw new AppError(404, "找不到服務請求");
  }

  if (existing.status !== ServiceRequestStatus.PENDING) {
    throw new AppError(400, "此請求已處理");
  }

  if (!canHandleDepartment(role, existing.targetDepartment)) {
    throw new AppError(403, "您所屬部門無法處理此請求");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.serviceRequest.update({
      where: { id },
      data: {
        status: ServiceRequestStatus.CONFIRMED,
        responseNote: note || null,
        handledById: userId,
        confirmedAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    const guestLabel = `${req.guestRoom} 號房 ${req.guestName}`;
    const timeLabel = formatTaipeiTime(req.scheduledAt);
    const confirmDetail = note ? ` ${note}` : "";

    await createImmediateDepartmentReminder(tx, {
      tenantId,
      serviceRequestId: req.id,
      title: `預約已確認：${req.title}`,
      message: `請通知 ${guestLabel}：餐飲部已確認預約（${timeLabel}）。${confirmDetail}`,
      notifyDepartment: Department.FRONT_DESK,
    });

    if (req.reminderAt) {
      await tx.reminder.create({
        data: {
          tenantId,
          serviceRequestId: req.id,
          title: `通知客人：${req.title}`,
          message: `請於 ${formatTaipeiTime(req.reminderAt)} 再次提醒 ${guestLabel}。餐飲部確認${note ? `：${note}` : "。"}`,
          remindAt: req.reminderAt,
          notifyDepartment: Department.FRONT_DESK,
        },
      });
    }

    return req;
  });

  return serializeRequest(updated);
}

export async function rejectServiceRequest(
  tenantId: string,
  userId: string,
  role: UserRole,
  id: string,
  responseNote: string,
) {
  const note = responseNote.trim();
  if (!note) {
    throw new AppError(400, "請填寫拒絕原因");
  }

  const existing = await prisma.serviceRequest.findFirst({
    where: withTenantScope(tenantId, { id }),
  });

  if (!existing) {
    throw new AppError(404, "找不到服務請求");
  }

  if (existing.status !== ServiceRequestStatus.PENDING) {
    throw new AppError(400, "此請求已處理");
  }

  if (!canHandleDepartment(role, existing.targetDepartment)) {
    throw new AppError(403, "您所屬部門無法處理此請求");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.serviceRequest.update({
      where: { id },
      data: {
        status: ServiceRequestStatus.REJECTED,
        responseNote: note,
        handledById: userId,
        rejectedAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    const guestLabel = `${req.guestRoom} 號房 ${req.guestName}`;
    const timeLabel = formatTaipeiTime(req.scheduledAt);
    await createImmediateDepartmentReminder(tx, {
      tenantId,
      serviceRequestId: req.id,
      title: `預約無法受理：${req.title}`,
      message: `請通知 ${guestLabel}：餐飲部無法受理 ${timeLabel} 的預約。原因：${note}`,
      notifyDepartment: Department.FRONT_DESK,
    });

    return req;
  });

  return serializeRequest(updated);
}

export function parseCreateServiceRequestBody(body: Record<string, unknown>) {
  const scheduledAtRaw = body.scheduledAt;
  const reminderAtRaw = body.reminderAt;

  if (typeof scheduledAtRaw !== "string" || !scheduledAtRaw) {
    throw new AppError(400, "scheduledAt 為必填");
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new AppError(400, "scheduledAt 格式無效");
  }

  let reminderAt: Date | undefined;
  if (reminderAtRaw !== undefined && reminderAtRaw !== null && reminderAtRaw !== "") {
    if (typeof reminderAtRaw !== "string") {
      throw new AppError(400, "reminderAt 格式無效");
    }
    reminderAt = new Date(reminderAtRaw);
    if (Number.isNaN(reminderAt.getTime())) {
      throw new AppError(400, "reminderAt 格式無效");
    }
  }

  const title = body.title;
  const guestRoom = body.guestRoom;
  const guestName = body.guestName;

  if (typeof title !== "string" || !title.trim()) {
    throw new AppError(400, "title 為必填");
  }
  if (typeof guestRoom !== "string" || !guestRoom.trim()) {
    throw new AppError(400, "guestRoom 為必填");
  }
  if (typeof guestName !== "string" || !guestName.trim()) {
    throw new AppError(400, "guestName 為必填");
  }

  return {
    type: parseRequestType(body.type),
    title,
    description: typeof body.description === "string" ? body.description : undefined,
    guestRoom,
    guestName,
    targetDepartment: parseDepartment(body.targetDepartment),
    scheduledAt,
    reminderAt,
  } satisfies CreateServiceRequestInput;
}
