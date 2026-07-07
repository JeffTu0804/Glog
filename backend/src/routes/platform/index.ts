import { Router } from "express";
import { authenticatePlatformAdmin } from "../../middleware/platformAuth.js";
import { platformAccessRequestRouter } from "./access-requests.js";
import { platformAnalyticsRouter } from "./analytics.js";
import { platformMeRouter } from "./me.js";
import { platformTenantsRouter } from "./tenants.js";

export const platformRouter = Router();

platformRouter.use("/access-requests", platformAccessRequestRouter);

platformRouter.use(authenticatePlatformAdmin);
platformRouter.use("/analytics", platformAnalyticsRouter);
platformRouter.use("/me", platformMeRouter);
platformRouter.use("/", platformTenantsRouter);
