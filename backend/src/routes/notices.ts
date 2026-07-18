import { Department } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import {
  createNotice,
  listActiveMemos,
  listNotices,
  markNoticeRead,
  type NoticeType,
} from "../services/hotelNoticeService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getParamId } from "../utils/validators.js";

export const noticesRouter = Router();

const DEPTS = new Set<string>(Object.values(Department));

/**
 * GET /api/v1/notices?type=MEMO&activeOnly=1
 */
noticesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const typeRaw =
      typeof req.query.type === "string" ? req.query.type.trim() : "";
    const type =
      typeRaw === "TASK" || typeRaw === "MEMO"
        ? (typeRaw as NoticeType)
        : undefined;
    const activeOnly =
      req.query.activeOnly === "1" || req.query.activeOnly === "true";

    const notices = await listNotices(req.user!.tenantId, { type, activeOnly });
    res.json({ notices });
  }),
);

/** GET /api/v1/notices/active-memos — 交班／首頁進行中公告 */
noticesRouter.get(
  "/active-memos",
  asyncHandler(async (req, res) => {
    const memos = await listActiveMemos(req.user!.tenantId);
    res.json({ memos });
  }),
);

/**
 * POST /api/v1/notices
 * Body: { type, title, content?, expiresAt?, targetDepartment?, guestRoom? }
 */
noticesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const type = req.body?.type as string;
    if (type !== "TASK" && type !== "MEMO") {
      throw new AppError(400, "type 必須為 TASK 或 MEMO");
    }

    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content =
      typeof req.body?.content === "string" ? req.body.content : undefined;
    const expiresAt =
      typeof req.body?.expiresAt === "string" && req.body.expiresAt.trim()
        ? req.body.expiresAt.trim()
        : null;
    const guestRoom =
      typeof req.body?.guestRoom === "string" ? req.body.guestRoom : undefined;
    const deptRaw =
      typeof req.body?.targetDepartment === "string"
        ? req.body.targetDepartment.trim()
        : "";
    const targetDepartment = DEPTS.has(deptRaw)
      ? (deptRaw as Department)
      : undefined;

    const notice = await createNotice({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      userRole: req.user!.role,
      userName: req.user!.name,
      type,
      title,
      content,
      expiresAt,
      targetDepartment,
      guestRoom,
    });

    res.status(201).json({ notice });
  }),
);

/** POST /api/v1/notices/:id/read — 手動下架 */
noticesRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notice = await markNoticeRead(
      req.user!.tenantId,
      getParamId(req.params, "公告 ID"),
    );
    res.json({ notice });
  }),
);
