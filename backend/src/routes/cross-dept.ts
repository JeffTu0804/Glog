import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import {
  bindEmployeeIdentity,
  createAndRouteTicket,
  findEmployeeByLineUserId,
  listTicketsForHotel,
} from "../services/crossDept/ticketService.js";
import {
  isCrossDeptDepartment,
  type CrossDeptDepartment,
} from "../services/crossDept/types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** 公開：LIFF 身分綁定（無需 JWT） */
export const crossDeptPublicRouter = Router();

/**
 * POST /api/v1/cross-dept/bind
 * Body: { lineUserId, hotelId, name, department }
 */
crossDeptPublicRouter.post(
  "/bind",
  asyncHandler(async (req, res) => {
    const lineUserId =
      typeof req.body?.lineUserId === "string" ? req.body.lineUserId.trim() : "";
    const hotelId =
      typeof req.body?.hotelId === "string" ? req.body.hotelId.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const departmentRaw =
      typeof req.body?.department === "string" ? req.body.department.trim() : "";

    if (!lineUserId || !hotelId || !name) {
      throw new AppError(400, "請填寫 Hotel ID、姓名，並確認 LINE 身分");
    }
    if (!isCrossDeptDepartment(departmentRaw)) {
      throw new AppError(400, "部門無效");
    }

    const employee = await bindEmployeeIdentity({
      lineUserId,
      hotelId,
      name,
      department: departmentRaw,
    });

    res.status(201).json({ employee });
  }),
);

/** 需登入：管理看板與 Web 派工 */
export const crossDeptRouter = Router();

/**
 * GET /api/v1/cross-dept/tickets
 * Query: hotelId? status? department? q?
 * - status: all | pending | in_progress | processing | completed | delayed | active（預設）
 * - department: front_desk | housekeeping | engineering | purchasing | spa
 * - q: case_number 模糊搜尋（例 047）
 * 安全：hotelId 一律由登入者 tenant 解析，忽略跨酒店偽造。
 */
crossDeptRouter.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    if (!req.user?.tenantId) throw new AppError(401, "未登入");

    const hotel = await prisma.hotel.findUnique({
      where: { tenantId: req.user.tenantId },
      select: { id: true },
    });
    const hotelId = hotel?.id ?? req.user.tenantId;

    const statusRaw =
      typeof req.query.status === "string" ? req.query.status.trim() : "active";
    const departmentRaw =
      typeof req.query.department === "string"
        ? req.query.department.trim()
        : "";
    const search =
      typeof req.query.q === "string" ? req.query.q.trim() : "";

    const toDepartment =
      departmentRaw && isCrossDeptDepartment(departmentRaw)
        ? departmentRaw
        : undefined;

    const tickets = await listTicketsForHotel(hotelId, {
      status: statusRaw as
        | "all"
        | "pending"
        | "processing"
        | "in_progress"
        | "completed"
        | "delayed"
        | "active",
      toDepartment,
      search: search || undefined,
    });

    res.json({ hotelId, tickets });
  }),
);

/**
 * POST /api/v1/cross-dept/tickets
 * Body: { toDepartment, description, lineUserId? }
 */
crossDeptRouter.post(
  "/tickets",
  asyncHandler(async (req, res) => {
    const toDepartmentRaw =
      typeof req.body?.toDepartment === "string"
        ? req.body.toDepartment.trim()
        : "";
    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";
    const lineUserId =
      typeof req.body?.lineUserId === "string"
        ? req.body.lineUserId.trim()
        : "";

    if (!isCrossDeptDepartment(toDepartmentRaw)) {
      throw new AppError(400, "目標部門無效");
    }
    if (!description) throw new AppError(400, "請填寫任務說明");

    let creator = lineUserId
      ? await findEmployeeByLineUserId(lineUserId)
      : null;

    if (!creator && req.user) {
      const hotel = await prisma.hotel.findUnique({
        where: { tenantId: req.user.tenantId },
        select: { id: true },
      });
      const hotelId = hotel?.id ?? req.user.tenantId;
      const deptMap: Record<string, CrossDeptDepartment> = {
        FRONT_DESK: "front_desk",
        HOUSEKEEPING: "housekeeping",
        ENGINEERING: "engineering",
        FOOD_BEVERAGE: "front_desk",
        MANAGEMENT: "front_desk",
      };
      const department =
        deptMap[req.user.department] ?? ("front_desk" as CrossDeptDepartment);

      creator = await bindEmployeeIdentity({
        lineUserId: lineUserId || `web:${req.user.id}`,
        hotelId,
        name: req.user.name,
        department,
      });
    }

    if (!creator) throw new AppError(400, "找不到發起人身分");

    const result = await createAndRouteTicket({
      creator,
      toDepartment: toDepartmentRaw,
      description,
    });

    res.status(201).json(result);
  }),
);
