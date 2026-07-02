import { Router } from "express";
import type { UserRole } from "@prisma/client";
import { Department } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  canAccessDepartment,
  roleToDepartment,
} from "../utils/department.js";
import { getParamId, parseEnumValue } from "../utils/validators.js";
import {
  addLogEntry,
  getLatestPublishedLogbook,
  getLogbook,
  getOrCreateCurrentLogbook,
  listLogbooks,
  publishLogbook,
  refreshAiSummary,
} from "../services/logbookService.js";
import { formatShiftWindow } from "../services/shiftService.js";

export const logbookRouter = Router();

const VALID_DEPARTMENTS = Object.values(Department);

function parseDepartmentQuery(
  value: unknown,
  userRole: UserRole,
): Department {
  const department =
    value != null && value !== ""
      ? parseEnumValue(value, VALID_DEPARTMENTS, "department")
      : roleToDepartment(userRole);

  if (!canAccessDepartment(userRole, department)) {
    throw new AppError(403, "無權限存取此部門的交班日誌");
  }

  return department;
}

/** GET /api/v1/logbook/current?department=FRONT_DESK — 目前班別日誌 + 上一班交班摘要 */
logbookRouter.get(
  "/current",
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const department = parseDepartmentQuery(req.query.department, req.user!.role);

    const [{ shift, logbook }, previousHandover] = await Promise.all([
      getOrCreateCurrentLogbook(tenantId, userId, department),
      getLatestPublishedLogbook(tenantId, department),
    ]);

    res.json({
      department,
      shift: {
        type: shift.shiftType,
        label: shift.label,
        window: formatShiftWindow(shift.shiftStart, shift.shiftEnd),
        shiftStart: shift.shiftStart.toISOString(),
        shiftEnd: shift.shiftEnd.toISOString(),
      },
      logbook,
      previousHandover,
    });
  }),
);

/** GET /api/v1/logbook?department=FRONT_DESK — 歷史交班日誌列表 */
logbookRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const department = parseDepartmentQuery(req.query.department, req.user!.role);
    const logbooks = await listLogbooks(req.user!.tenantId, department);
    res.json({ department, logbooks });
  }),
);

/** GET /api/v1/logbook/:id */
logbookRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const logbook = await getLogbook(req.user!.tenantId, getParamId(req.params, "日誌 ID"));
    if (!canAccessDepartment(req.user!.role, logbook.department as Department)) {
      throw new AppError(403, "無權限存取此部門的交班日誌");
    }
    res.json({ logbook });
  }),
);

/** POST /api/v1/logbook/:id/entries — 新增手動備註 */
logbookRouter.post(
  "/:id/entries",
  asyncHandler(async (req, res) => {
    const { content } = req.body as { content?: unknown };
    if (typeof content !== "string") {
      res.status(400).json({ error: "content 為必填" });
      return;
    }

    const existing = await getLogbook(req.user!.tenantId, getParamId(req.params, "日誌 ID"));
    if (!canAccessDepartment(req.user!.role, existing.department as Department)) {
      throw new AppError(403, "無權限存取此部門的交班日誌");
    }

    const result = await addLogEntry(
      req.user!.tenantId,
      req.user!.id,
      getParamId(req.params, "日誌 ID"),
      content,
    );

    res.status(201).json(result);
  }),
);

/** POST /api/v1/logbook/:id/publish — 產生 AI 摘要並交班，推播 LINE 通知 */
logbookRouter.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const existing = await getLogbook(req.user!.tenantId, getParamId(req.params, "日誌 ID"));
    if (!canAccessDepartment(req.user!.role, existing.department as Department)) {
      throw new AppError(403, "無權限存取此部門的交班日誌");
    }

    const logbook = await publishLogbook(
      req.user!.tenantId,
      req.user!.id,
      getParamId(req.params, "日誌 ID"),
    );
    res.json({ logbook });
  }),
);

/** POST /api/v1/logbook/:id/refresh-summary — 重新產生 AI 摘要 */
logbookRouter.post(
  "/:id/refresh-summary",
  asyncHandler(async (req, res) => {
    const existing = await getLogbook(req.user!.tenantId, getParamId(req.params, "日誌 ID"));
    if (!canAccessDepartment(req.user!.role, existing.department as Department)) {
      throw new AppError(403, "無權限存取此部門的交班日誌");
    }

    const logbook = await refreshAiSummary(
      req.user!.tenantId,
      getParamId(req.params, "日誌 ID"),
    );
    res.json({ logbook });
  }),
);
