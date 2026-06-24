import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const platformMeRouter = Router();

platformMeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ admin: req.platformAdmin });
  }),
);
