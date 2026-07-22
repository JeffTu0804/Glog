import { Router } from "express";
import { requireHotelAdmin } from "../middleware/requireHotelAdmin.js";
import { generateExecutiveSummary } from "../services/analyticsAiSummaryService.js";
import {
  getAnalyticsOverview,
  parseAnalyticsDepartment,
  parseAnalyticsPeriod,
} from "../services/analyticsService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireHotelAdmin);

/** GET /api/v1/analytics — 固定本租戶，不可跨飯店 */
analyticsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const period = parseAnalyticsPeriod(req.query.period);
    const department = parseAnalyticsDepartment(req.query.department);
    const analytics = await getAnalyticsOverview({
      period,
      tenantId: req.user!.tenantId,
      department,
    });
    res.json({ analytics });
  }),
);

/** GET /api/v1/analytics/ai-summary */
analyticsRouter.get(
  "/ai-summary",
  asyncHandler(async (req, res) => {
    const period = parseAnalyticsPeriod(req.query.period);
    const department = parseAnalyticsDepartment(req.query.department);
    const summary = await generateExecutiveSummary({
      period,
      tenantId: req.user!.tenantId,
      department,
    });
    res.json({ summary, period, department });
  }),
);
