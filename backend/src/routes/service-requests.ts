import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireRole } from "../middleware/requireRole.js";
import {
  confirmServiceRequest,
  createServiceRequest,
  getServiceRequest,
  listServiceRequests,
  parseCreateServiceRequestBody,
  rejectServiceRequest,
} from "../services/serviceRequestService.js";
import { canCreateServiceRequest } from "../utils/department.js";
import { AppError } from "../errors/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getParamId } from "../utils/validators.js";

export const serviceRequestsRouter = Router();

const CREATE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.FRONT_DESK,
  UserRole.HOUSEKEEPING,
];

/** POST /api/v1/service-requests */
serviceRequestsRouter.post(
  "/",
  requireRole(...CREATE_ROLES),
  asyncHandler(async (req, res) => {
    if (!canCreateServiceRequest(req.user!.role)) {
      throw new AppError(403, "無法建立服務請求");
    }

    const input = parseCreateServiceRequestBody(
      req.body as Record<string, unknown>,
    );

    const request = await createServiceRequest(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      input,
    );

    res.status(201).json({ request });
  }),
);

/** GET /api/v1/service-requests?view=inbox|sent|all */
serviceRequestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const viewRaw = req.query.view;
    const view =
      viewRaw === "sent" || viewRaw === "all" ? viewRaw : "inbox";

    const requests = await listServiceRequests(
      req.user!.tenantId,
      req.user!.role,
      view,
      req.user!.id,
    );

    res.json({ requests });
  }),
);

/** GET /api/v1/service-requests/:id */
serviceRequestsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const request = await getServiceRequest(
      req.user!.tenantId,
      getParamId(req.params, "請求 ID"),
    );
    res.json({ request });
  }),
);

/** POST /api/v1/service-requests/:id/confirm */
serviceRequestsRouter.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const { responseNote } = req.body as { responseNote?: unknown };
    if (typeof responseNote !== "string") {
      throw new AppError(400, "responseNote 為必填");
    }

    const request = await confirmServiceRequest(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      getParamId(req.params, "請求 ID"),
      responseNote,
    );

    res.json({ request });
  }),
);

/** POST /api/v1/service-requests/:id/reject */
serviceRequestsRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const { responseNote } = req.body as { responseNote?: unknown };
    if (typeof responseNote !== "string") {
      throw new AppError(400, "responseNote 為必填");
    }

    const request = await rejectServiceRequest(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      getParamId(req.params, "請求 ID"),
      responseNote,
    );

    res.json({ request });
  }),
);
