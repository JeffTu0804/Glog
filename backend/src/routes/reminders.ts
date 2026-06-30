import { Router } from "express";
import {
  dismissReminder,
  getActiveReminders,
  listUpcomingReminders,
} from "../services/reminderService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getParamId } from "../utils/validators.js";

export const remindersRouter = Router();

/** GET /api/v1/reminders/active — 觸發到期提醒並回傳 */
remindersRouter.get(
  "/active",
  asyncHandler(async (req, res) => {
    const reminders = await getActiveReminders(
      req.user!.tenantId,
      req.user!.role,
    );
    res.json({ reminders });
  }),
);

/** GET /api/v1/reminders/upcoming — 即將到來的提醒 */
remindersRouter.get(
  "/upcoming",
  asyncHandler(async (req, res) => {
    const reminders = await listUpcomingReminders(
      req.user!.tenantId,
      req.user!.role,
    );
    res.json({ reminders });
  }),
);

/** POST /api/v1/reminders/:id/dismiss */
remindersRouter.post(
  "/:id/dismiss",
  asyncHandler(async (req, res) => {
    const reminder = await dismissReminder(
      req.user!.tenantId,
      req.user!.role,
      getParamId(req.params, "提醒 ID"),
    );
    res.json({ reminder });
  }),
);
