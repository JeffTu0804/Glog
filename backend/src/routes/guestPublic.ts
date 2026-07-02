import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getRoomInfoByQrToken,
  submitGuestRequest,
} from "../services/guestRequestService.js";

/** 住客免登入 API */
export const guestPublicRouter = Router();

guestPublicRouter.get(
  "/room-info",
  asyncHandler(async (req, res) => {
    const t = typeof req.query.t === "string" ? req.query.t : "";
    const roomInfo = await getRoomInfoByQrToken(t);
    res.json(roomInfo);
  }),
);

guestPublicRouter.post(
  "/requests",
  asyncHandler(async (req, res) => {
    const body = req.body as {
      hotel_id?: unknown;
      room_id?: unknown;
      request_type?: unknown;
      notes?: unknown;
    };

    const result = await submitGuestRequest({
      hotel_id: typeof body.hotel_id === "string" ? body.hotel_id : "",
      room_id: typeof body.room_id === "string" ? body.room_id : "",
      request_type: typeof body.request_type === "string" ? body.request_type : "",
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    res.status(201).json(result);
  }),
);

/** 向後相容舊路徑 */
guestPublicRouter.post(
  "/submit-request",
  asyncHandler(async (req, res) => {
    const body = req.body as {
      hotel_id?: unknown;
      room_id?: unknown;
      request_type?: unknown;
      notes?: unknown;
    };

    const result = await submitGuestRequest({
      hotel_id: typeof body.hotel_id === "string" ? body.hotel_id : "",
      room_id: typeof body.room_id === "string" ? body.room_id : "",
      request_type: typeof body.request_type === "string" ? body.request_type : "",
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    res.status(201).json(result);
  }),
);
