import { Router } from "express";
import {
  findCostLogForTenant,
  listCostLogs,
} from "../services/costLogService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getParamId } from "../utils/validators.js";

export const costLogsRouter = Router();

/**
 * GET /api/v1/cost-logs
 * 列出本租戶成本紀錄，支援 ticketId / category 篩選
 */
costLogsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { ticketId, category } = req.query;

    const costLogs = await listCostLogs(req.user!.tenantId, {
      ticketId: typeof ticketId === "string" ? ticketId : undefined,
      category: typeof category === "string" ? category : undefined,
    });

    res.json({ costLogs });
  }),
);

/**
 * GET /api/v1/cost-logs/:id
 * 取得單筆成本紀錄詳情
 */
costLogsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const costLog = await findCostLogForTenant(
      req.user!.tenantId,
      getParamId(req.params, "成本紀錄 ID"),
    );

    res.json({ costLog });
  }),
);
