import { Department, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import {
  GUEST_REQUEST_LABELS,
  GUEST_REQUEST_STATUS_LABELS,
  GUEST_SLA_MINUTES,
  canHandleGuestRequest,
  departmentForGuestRequestType,
  isGuestRequestType,
} from "../utils/guestRequestType.js";
import { getHotelByTenantId } from "./hotelBootstrapService.js";
import {
  notifyGuestRequestCreated,
  notifyGuestRequestOverdue,
} from "./lineMessagingService.js";
import {
  cancelGuestRequestReminders,
  createImmediateDepartmentReminder,
  createScheduledDepartmentReminder,
} from "./reminderService.js";

const GUEST_REQUEST_INCLUDE = {
  room: { select: { roomNumber: true } },
  hotel: { select: { id: true, name: true, tenantId: true, lineOfficialToken: true } },
  handledBy: { select: { id: true, name: true } },
};

function serializeGuestRequest(
  r: {
    id: string;
    hotelId: string;
    roomId: string;
    requestType: string;
    targetDepartment: Department;
    status: string;
    notes: string | null;
    createdAt: Date;
    completedAt: Date | null;
    room: { roomNumber: string };
    hotel: { id: string; name: string; tenantId: string };
    handledBy: { id: string; name: string } | null;
  },
) {
  const type = isGuestRequestType(r.requestType) ? r.requestType : null;
  return {
    id: r.id,
    hotel_id: r.hotelId,
    room_id: r.roomId,
    room_number: r.room.roomNumber,
    hotel_name: r.hotel.name,
    request_type: r.requestType,
    request_label: type ? GUEST_REQUEST_LABELS[type] : r.requestType,
    target_department: r.targetDepartment,
    status: r.status,
    status_label: GUEST_REQUEST_STATUS_LABELS[r.status] ?? r.status,
    notes: r.notes,
    handled_by: r.handledBy,
    created_at: r.createdAt.toISOString(),
    completed_at: r.completedAt?.toISOString() ?? null,
  };
}

export async function getRoomInfoByQrToken(qrToken: string) {
  const token = qrToken.trim();
  if (!token) throw new AppError(400, "缺少 QR 識別碼（參數 t）");

  const room = await prisma.room.findUnique({
    where: { qrToken: token },
    include: { hotel: { select: { id: true, name: true, tenantId: true } } },
  });

  if (!room) {
    throw new AppError(404, "找不到此 QR Code 對應的房間，請確認是否掃描正確的房間條碼");
  }

  return {
    room_id: room.id,
    room_number: room.roomNumber,
    hotel_id: room.hotel.id,
    hotel_name: room.hotel.name,
    tenant_id: room.hotel.tenantId,
  };
}

export async function submitGuestRequest(input: {
  hotel_id: string;
  room_id: string;
  request_type: string;
  notes?: string;
}) {
  const hotelId = input.hotel_id.trim();
  const roomId = input.room_id.trim();
  const requestType = input.request_type.trim();

  if (!hotelId || !roomId || !requestType) {
    throw new AppError(400, "hotel_id、room_id、request_type 為必填");
  }
  if (!isGuestRequestType(requestType)) {
    throw new AppError(400, "無效的 request_type");
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId },
    include: { hotel: true },
  });
  if (!room) throw new AppError(404, "房間不存在，或與飯店資料不符");

  const targetDepartment = departmentForGuestRequestType(requestType);
  const requestLabel = GUEST_REQUEST_LABELS[requestType];
  const tenantId = room.hotel.tenantId;
  const slaAt = new Date(Date.now() + GUEST_SLA_MINUTES * 60 * 1000);

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.guestRequest.create({
      data: {
        hotelId,
        roomId,
        requestType,
        targetDepartment,
        status: "pending",
        notes: input.notes?.trim() || undefined,
      },
      include: GUEST_REQUEST_INCLUDE,
    });

    const roomLabel = `${room.roomNumber} 號房`;
    await createImmediateDepartmentReminder(tx, {
      tenantId,
      guestRequestId: req.id,
      notifyDepartment: targetDepartment,
      title: `新住客請求：${requestLabel}`,
      message: `${room.hotel.name} · ${roomLabel} · ${requestLabel}，請儘快處理。`,
    });

    await createScheduledDepartmentReminder(tx, {
      tenantId,
      guestRequestId: req.id,
      notifyDepartment: targetDepartment,
      remindAt: slaAt,
      title: `住客請求逾時：${requestLabel}`,
      message: `${roomLabel} 的 ${requestLabel} 已超過 ${GUEST_SLA_MINUTES} 分鐘未結案，請追蹤。`,
    });

    if (targetDepartment !== Department.FRONT_DESK) {
      await createScheduledDepartmentReminder(tx, {
        tenantId,
        guestRequestId: req.id,
        notifyDepartment: Department.FRONT_DESK,
        remindAt: slaAt,
        title: `住客請求逾時（需協調）：${requestLabel}`,
        message: `${roomLabel} 的 ${requestLabel} 逾時未結案，請協調 ${targetDepartment} 處理。`,
      });
    }

    return req;
  });

  void notifyGuestRequestCreated({
    tenantId,
    hotelName: room.hotel.name,
    roomNumber: room.roomNumber,
    requestLabel,
    department: targetDepartment,
    lineOfficialToken: room.hotel.lineOfficialToken,
  }).catch((err) => console.error("[Guest LINE] 建立推播失敗", err));

  return serializeGuestRequest(created);
}

export async function listGuestRequestsForTenant(
  tenantId: string,
  role: UserRole,
  options?: { status?: string; view?: "inbox" | "all" },
) {
  const hotel = await getHotelByTenantId(tenantId);
  if (!hotel) return [];

  const where: {
    hotelId: string;
    status?: string;
    targetDepartment?: Department;
  } = { hotelId: hotel.id };

  if (options?.status) where.status = options.status;

  if (options?.view !== "all" && role !== UserRole.ADMIN && role !== UserRole.FRONT_DESK) {
    where.targetDepartment = role === UserRole.ENGINEER
      ? Department.ENGINEERING
      : role === UserRole.HOUSEKEEPING
        ? Department.HOUSEKEEPING
        : role === UserRole.FOOD_BEVERAGE
          ? Department.FOOD_BEVERAGE
          : Department.FRONT_DESK;
  }

  const requests = await prisma.guestRequest.findMany({
    where,
    include: GUEST_REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return requests.map(serializeGuestRequest);
}

export async function updateGuestRequestStatus(
  tenantId: string,
  userId: string,
  role: UserRole,
  requestId: string,
  status: "processing" | "completed",
  notes?: string,
) {
  const hotel = await getHotelByTenantId(tenantId);
  if (!hotel) throw new AppError(404, "找不到飯店資料");

  const existing = await prisma.guestRequest.findFirst({
    where: { id: requestId, hotelId: hotel.id },
    include: GUEST_REQUEST_INCLUDE,
  });
  if (!existing) throw new AppError(404, "找不到住客請求");

  if (!canHandleGuestRequest(role, existing.targetDepartment)) {
    throw new AppError(403, "無權限處理此住客請求");
  }

  if (existing.status === "completed") {
    throw new AppError(400, "此請求已結案");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.guestRequest.update({
      where: { id: requestId },
      data: {
        status,
        handledById: userId,
        notes: notes?.trim() || existing.notes,
        completedAt: status === "completed" ? new Date() : null,
      },
      include: GUEST_REQUEST_INCLUDE,
    });

    if (status === "completed") {
      await cancelGuestRequestReminders(tx, requestId);
    }

    return req;
  });

  return serializeGuestRequest(updated);
}

/** 逾時提醒觸發時呼叫 LINE（由 reminders 路由或 cron 觸發） */
export async function processGuestRequestOverdueReminder(reminderId: string) {
  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
    include: {
      guestRequest: {
        include: {
          room: true,
          hotel: true,
        },
      },
    },
  });

  if (!reminder?.guestRequestId || !reminder.guestRequest) return;
  const req = reminder.guestRequest;
  if (req.status === "completed") return;

  const type = isGuestRequestType(req.requestType) ? req.requestType : "other";
  await notifyGuestRequestOverdue({
    tenantId: reminder.tenantId,
    hotelName: req.hotel.name,
    roomNumber: req.room.roomNumber,
    requestLabel: GUEST_REQUEST_LABELS[type],
    department: req.targetDepartment,
    lineOfficialToken: req.hotel.lineOfficialToken,
  });
}

export async function processDueGuestRequestReminders(tenantId: string) {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: {
      tenantId,
      guestRequestId: { not: null },
      status: "SCHEDULED",
      remindAt: { lte: now },
    },
    select: { id: true },
  });

  for (const r of due) {
    await processGuestRequestOverdueReminder(r.id);
  }
}
