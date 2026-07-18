import { Department, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { roleToDepartment } from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { createDepartmentTaskFromLine } from "./departmentTaskService.js";

export type NoticeType = "TASK" | "MEMO";
export type NoticeStatus = "UNREAD" | "READ";

export interface HotelNoticeDto {
  id: string;
  type: NoticeType;
  status: NoticeStatus;
  title: string;
  content: string | null;
  expiresAt: string | null;
  targetDepartment: string | null;
  guestRoom: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

function serialize(n: {
  id: string;
  type: string;
  status: string;
  title: string;
  content: string | null;
  expiresAt: Date | null;
  targetDepartment: string | null;
  guestRoom: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
}): HotelNoticeDto {
  return {
    id: n.id,
    type: n.type as NoticeType,
    status: n.status as NoticeStatus,
    title: n.title,
    content: n.content,
    expiresAt: n.expiresAt?.toISOString() ?? null,
    targetDepartment: n.targetDepartment,
    guestRoom: n.guestRoom,
    createdAt: n.createdAt.toISOString(),
    createdBy: n.createdBy,
  };
}

/** 進行中且未過期的 MEMO（交班／首頁用） */
export async function listActiveMemos(tenantId: string): Promise<HotelNoticeDto[]> {
  const now = new Date();
  const rows = await prisma.hotelNotice.findMany({
    where: withTenantScope(tenantId, {
      type: "MEMO",
      status: "UNREAD",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    }),
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
}

export async function listNotices(
  tenantId: string,
  opts?: { type?: NoticeType; activeOnly?: boolean },
): Promise<HotelNoticeDto[]> {
  const now = new Date();
  const rows = await prisma.hotelNotice.findMany({
    where: withTenantScope(tenantId, {
      ...(opts?.type ? { type: opts.type } : {}),
      ...(opts?.activeOnly
        ? {
            status: "UNREAD",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          }
        : {}),
    }),
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serialize);
}

export async function createNotice(params: {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  type: NoticeType;
  title: string;
  content?: string;
  expiresAt?: string | null;
  targetDepartment?: Department;
  guestRoom?: string;
}): Promise<HotelNoticeDto> {
  const title = params.title.trim();
  if (!title) throw new AppError(400, "請填寫標題");

  if (params.type === "TASK") {
    const dept = params.targetDepartment;
    if (!dept) throw new AppError(400, "任務請選擇目標部門");
    const room = params.guestRoom?.trim() || "—";

    const category =
      dept === Department.ENGINEERING
        ? ("維修" as const)
        : dept === Department.HOUSEKEEPING
          ? ("清潔" as const)
          : ("客務" as const);

    try {
      await createDepartmentTaskFromLine({
        tenantId: params.tenantId,
        userId: params.userId,
        userRole: params.userRole,
        triggeredByName: params.userName,
        roomNumber: room,
        category,
        title,
        description: params.content?.trim() || title,
      });
    } catch (err) {
      throw new AppError(
        400,
        err instanceof Error ? err.message : "建立任務失敗",
      );
    }
  }

  let expiresAt: Date | null = null;
  if (params.type === "MEMO" && params.expiresAt) {
    const d = new Date(params.expiresAt);
    if (Number.isNaN(d.getTime())) {
      throw new AppError(400, "結束時間格式無效");
    }
    expiresAt = d;
  }

  const notice = await prisma.hotelNotice.create({
    data: {
      tenantId: params.tenantId,
      type: params.type,
      status: "UNREAD",
      title,
      content: params.content?.trim() || null,
      expiresAt: params.type === "MEMO" ? expiresAt : null,
      targetDepartment: params.targetDepartment ?? roleToDepartment(params.userRole),
      guestRoom: params.guestRoom?.trim() || null,
      createdById: params.userId,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return serialize(notice);
}

/** 手動下架照會 */
export async function markNoticeRead(
  tenantId: string,
  noticeId: string,
): Promise<HotelNoticeDto> {
  const existing = await prisma.hotelNotice.findFirst({
    where: withTenantScope(tenantId, { id: noticeId }),
  });
  if (!existing) throw new AppError(404, "找不到公告");

  const updated = await prisma.hotelNotice.update({
    where: { id: noticeId },
    data: { status: "READ" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  return serialize(updated);
}
