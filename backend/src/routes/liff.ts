import { Department } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { createNotice, type NoticeType } from "../services/hotelNoticeService.js";
import { DEPARTMENT_LABELS, roleToDepartment } from "../utils/department.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** 公開：LIFF 報修／通報（以 LINE userId 辨識員工，無需 JWT） */
export const liffPublicRouter = Router();

const DEPTS = new Set<string>(Object.values(Department));

const REPORT_DEPTS = [
  Department.ENGINEERING,
  Department.HOUSEKEEPING,
  Department.FRONT_DESK,
  Department.FOOD_BEVERAGE,
] as const;

async function findStaffByLineUserId(lineUserId: string) {
  const users = await prisma.user.findMany({
    where: {
      lineUserId,
      accountStatus: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      role: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
    take: 2,
  });

  if (users.length === 0) return null;
  if (users.length > 1) {
    throw new AppError(
      409,
      "此 LINE 帳號對應多筆員工資料，請聯絡管理員處理。",
    );
  }
  return users[0]!;
}

/**
 * GET /api/v1/liff/staff?lineUserId=
 * 依 LINE userId 反查員工身分（需已用 LINE 登入／onboarding 綁定）
 */
liffPublicRouter.get(
  "/staff",
  asyncHandler(async (req, res) => {
    const lineUserId =
      typeof req.query.lineUserId === "string"
        ? req.query.lineUserId.trim()
        : "";
    if (!lineUserId) throw new AppError(400, "缺少 lineUserId");

    const user = await findStaffByLineUserId(lineUserId);
    if (!user) {
      throw new AppError(
        404,
        "未能在系統中找到您的員工身份，請先以 LINE 登入完成綁定，或聯絡經理處理。",
      );
    }

    const department = roleToDepartment(user.role);
    res.json({
      staff: {
        name: user.name,
        department,
        departmentLabel: DEPARTMENT_LABELS[department],
        hotelName: user.tenant.name,
      },
    });
  }),
);

/**
 * POST /api/v1/liff/notices
 * Body: { lineUserId, type, description, targetDepartment?, roomNumber? }
 */
liffPublicRouter.post(
  "/notices",
  asyncHandler(async (req, res) => {
    const lineUserId =
      typeof req.body?.lineUserId === "string"
        ? req.body.lineUserId.trim()
        : "";
    const typeRaw =
      typeof req.body?.type === "string" ? req.body.type.trim() : "";
    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";
    const roomRaw =
      typeof req.body?.roomNumber === "string"
        ? req.body.roomNumber.trim()
        : "";
    // 「403號房」→「403」，避免 Flex 標題出現「403號房 號房」
    const roomNumber = roomRaw
      .replace(/號房$/u, "")
      .replace(/^房/u, "")
      .trim();
    const deptRaw =
      typeof req.body?.targetDepartment === "string"
        ? req.body.targetDepartment.trim()
        : "";

    if (!lineUserId) throw new AppError(400, "缺少 lineUserId");
    if (typeRaw !== "TASK" && typeRaw !== "MEMO") {
      throw new AppError(400, "type 必須為 TASK 或 MEMO");
    }
    if (!description) throw new AppError(400, "請填寫內容說明");

    const type = typeRaw as NoticeType;
    let targetDepartment: Department | undefined;
    if (type === "TASK") {
      if (!DEPTS.has(deptRaw)) {
        throw new AppError(400, "目標部門無效");
      }
      targetDepartment = deptRaw as Department;
      if (
        !REPORT_DEPTS.includes(
          targetDepartment as (typeof REPORT_DEPTS)[number],
        )
      ) {
        throw new AppError(400, "此部門不支援行動通報");
      }
    }

    const user = await findStaffByLineUserId(lineUserId);
    if (!user) {
      throw new AppError(
        404,
        "未能在系統中找到您的員工身份，請先以 LINE 登入完成綁定，或聯絡經理處理。",
      );
    }

    const title =
      roomNumber.length > 0
        ? `${roomNumber} ${description}`.slice(0, 80)
        : description.slice(0, 80);

    const notice = await createNotice({
      tenantId: user.tenantId,
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      type,
      title,
      content: description,
      targetDepartment,
      guestRoom: roomNumber || undefined,
    });

    res.status(201).json({ notice });
  }),
);
