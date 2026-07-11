import { Department, UserRole } from "@prisma/client";
import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";
import {
  confirmServiceRequest,
  createServiceRequest,
  getServiceRequest,
  listServiceRequests,
  parseCreateServiceRequestBody,
  rejectServiceRequest,
} from "../services/serviceRequestService.js";
import {
  acceptServiceRequestById,
  completeServiceRequestById,
} from "../services/departmentTaskService.js";
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
      viewRaw === "sent" || viewRaw === "all" || viewRaw === "active"
        ? viewRaw
        : "inbox";

    const deptRaw = req.query.department;
    const targetDepartment =
      typeof deptRaw === "string" &&
      Object.values(Department).includes(deptRaw as Department)
        ? (deptRaw as Department)
        : undefined;

    const requests = await listServiceRequests(
      req.user!.tenantId,
      req.user!.role,
      view,
      req.user!.id,
      targetDepartment,
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

/** POST /api/v1/service-requests/:id/accept — 部門接單 */
serviceRequestsRouter.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    await acceptServiceRequestById(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      getParamId(req.params, "請求 ID"),
    );

    const request = await getServiceRequest(
      req.user!.tenantId,
      getParamId(req.params, "請求 ID"),
    );

    res.json({ request, message: "已接單，請完成後上傳照片結案" });
  }),
);

/** POST /api/v1/service-requests/:id/complete — 上傳照片並結案 */
serviceRequestsRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const { note, photo } = req.body as {
      note?: unknown;
      photo?: { data?: unknown; mimeType?: unknown };
    };

    if (!photo || typeof photo.data !== "string" || !photo.data.trim()) {
      throw new AppError(400, "請上傳完成照片");
    }

    const mimeType =
      typeof photo.mimeType === "string" ? photo.mimeType : "image/jpeg";
    const base64 = photo.data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length === 0) {
      throw new AppError(400, "照片格式無效");
    }

    await completeServiceRequestById(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      getParamId(req.params, "請求 ID"),
      buffer,
      mimeType,
      typeof note === "string" ? note : undefined,
    );

    const request = await getServiceRequest(
      req.user!.tenantId,
      getParamId(req.params, "請求 ID"),
    );

    res.json({ request, message: "任務已完成，已通知客務部" });
  }),
);

/** POST /api/v1/service-requests/:id/confirm */
serviceRequestsRouter.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const { responseNote } = req.body as { responseNote?: unknown };
    const note = typeof responseNote === "string" ? responseNote : "";

    const request = await confirmServiceRequest(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      getParamId(req.params, "請求 ID"),
      note,
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
