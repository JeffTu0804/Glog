import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";

export const meRouter = Router();

/**
 * GET /api/v1/me
 * 驗證 JWT 與多租戶綁定是否正常運作。
 */
meRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);
