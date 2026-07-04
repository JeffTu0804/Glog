import { Router } from "express";
import { authenticatePlatformAdmin } from "../../middleware/platformAuth.js";
import { platformAccessRequestRouter } from "./access-requests.js";
import { platformMeRouter } from "./me.js";
import { platformTenantsRouter } from "./tenants.js";

export const platformRouter = Router();

platformRouter.use("/access-requests", platformAccessRequestRouter);

platformRouter.use(authenticatePlatformAdmin);
platformRouter.use("/me", platformMeRouter);
platformRouter.use("/", platformTenantsRouter);
