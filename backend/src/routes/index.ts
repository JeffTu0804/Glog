import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { assetsRouter } from "./assets.js";
import { costLogsRouter } from "./cost-logs.js";
import { logbookRouter } from "./logbook.js";
import { guestRequestsRouter } from "./guest-requests.js";
import { homeRouter } from "./home.js";
import { remindersRouter } from "./reminders.js";
import { serviceRequestsRouter } from "./service-requests.js";
import { inventoryRouter } from "./inventory.js";
import { maintenanceTicketsRouter } from "./maintenance-tickets.js";
import { meRouter } from "./me.js";
import { usersRouter } from "./users.js";
import { crossDeptRouter } from "./cross-dept.js";
import { noticesRouter } from "./notices.js";
import { chatRouter } from "./chat.js";

export const apiRouter = Router();

// 所有 /api/v1 路由均需通過 JWT 驗證與 tenantId 綁定
apiRouter.use(authenticate);

apiRouter.use("/me", meRouter);
apiRouter.use("/maintenance-tickets", maintenanceTicketsRouter);
apiRouter.use("/assets", assetsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/inventory", inventoryRouter);
apiRouter.use("/cost-logs", costLogsRouter);
apiRouter.use("/logbook", logbookRouter);
apiRouter.use("/service-requests", serviceRequestsRouter);
apiRouter.use("/reminders", remindersRouter);
apiRouter.use("/guest-requests", guestRequestsRouter);
apiRouter.use("/home", homeRouter);
apiRouter.use("/cross-dept", crossDeptRouter);
apiRouter.use("/notices", noticesRouter);
apiRouter.use("/chat", chatRouter);
