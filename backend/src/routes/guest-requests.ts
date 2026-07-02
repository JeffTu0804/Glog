import { Router } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getParamId } from "../utils/validators.js";
import {
  ensureHotelForTenant,
  syncRoomsFromAssets,
} from "../services/hotelBootstrapService.js";
import {
  listGuestRequestsForTenant,
  updateGuestRequestStatus,
} from "../services/guestRequestService.js";
import {
  listRoomsForTenant,
  regenerateRoomQrToken,
  updateHotelLineToken,
} from "../services/roomService.js";
import { prisma } from "../lib/prisma.js";

export const guestRequestsRouter = Router();

/** GET /api/v1/guest-requests/rooms — QR 客房列表 */
guestRequestsRouter.get(
  "/rooms",
  asyncHandler(async (req, res) => {
    const rooms = await listRoomsForTenant(req.user!.tenantId);
    res.json({ rooms });
  }),
);

/** POST /api/v1/guest-requests/rooms/sync — 從資產同步客房 */
guestRequestsRouter.post(
  "/rooms/sync",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== UserRole.ADMIN) {
      throw new AppError(403, "僅管理員可同步客房");
    }

    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, "找不到租戶");

    const result = await prisma.$transaction(async (tx) => {
      await ensureHotelForTenant(tx, tenantId, tenant.name);
      return syncRoomsFromAssets(tx, tenantId);
    });

    const rooms = await listRoomsForTenant(tenantId);
    res.json({ ...result, rooms });
  }),
);

/** POST /api/v1/guest-requests/rooms/:id/regenerate-qr */
guestRequestsRouter.post(
  "/rooms/:id/regenerate-qr",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== UserRole.ADMIN) {
      throw new AppError(403, "僅管理員可重新產生 QR");
    }

    const room = await regenerateRoomQrToken(
      req.user!.tenantId,
      getParamId(req.params, "客房 ID"),
    );
    res.json({ room });
  }),
);

/** PATCH /api/v1/guest-requests/hotel/line-token */
guestRequestsRouter.patch(
  "/hotel/line-token",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== UserRole.ADMIN) {
      throw new AppError(403, "僅管理員可設定 LINE Token");
    }

    const { lineOfficialToken } = req.body as { lineOfficialToken?: unknown };
    const hotel = await updateHotelLineToken(
      req.user!.tenantId,
      typeof lineOfficialToken === "string" ? lineOfficialToken : null,
    );
    res.json({ hotel });
  }),
);

/** GET /api/v1/guest-requests — 住客請求收件匣 */
guestRequestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const view = req.query.view === "all" ? "all" : "inbox";

    const requests = await listGuestRequestsForTenant(
      req.user!.tenantId,
      req.user!.role,
      { status, view },
    );

    res.json({ requests });
  }),
);

/** PATCH /api/v1/guest-requests/:id — 更新狀態 */
guestRequestsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body as { status?: unknown; notes?: unknown };

    if (status !== "processing" && status !== "completed") {
      throw new AppError(400, "status 必須為 processing 或 completed");
    }

    const request = await updateGuestRequestStatus(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      getParamId(req.params, "請求 ID"),
      status,
      typeof notes === "string" ? notes : undefined,
    );

    res.json({ request });
  }),
);
