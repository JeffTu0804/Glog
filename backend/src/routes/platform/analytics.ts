import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  generateExecutiveSummary,
} from "../../services/analyticsAiSummaryService.js";
import {
  getAnalyticsOverview,
  parseAnalyticsDepartment,
  parseAnalyticsPeriod,
} from "../../services/analyticsService.js";

export const platformAnalyticsRouter = Router();

/** GET /api/platform/v1/analytics?period=&department=&tenantId= */
platformAnalyticsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const period = parseAnalyticsPeriod(req.query.period);
    const department = parseAnalyticsDepartment(req.query.department);
    const tenantId =
      typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId.trim()
        : undefined;

    const analytics = await getAnalyticsOverview({ period, tenantId, department });
    res.json({ analytics });
  }),
);

/** GET /api/platform/v1/analytics/ai-summary?period=&department=&tenantId= */
platformAnalyticsRouter.get(
  "/ai-summary",
  asyncHandler(async (req, res) => {
    const period = parseAnalyticsPeriod(req.query.period);
    const department = parseAnalyticsDepartment(req.query.department);
    const tenantId =
      typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId.trim()
        : undefined;

    const summary = await generateExecutiveSummary({ period, tenantId, department });
    res.json({ summary, period, department });
  }),
);
