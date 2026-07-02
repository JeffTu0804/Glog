import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { authenticateSupabase } from "../middleware/supabaseAuth.js";
import { registerHotel } from "../services/authService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

/**
 * POST /api/v1/auth/register
 * 註冊新飯店租戶 + 第一位管理員（需先完成 Supabase signUp / OAuth）
 */
authRouter.post(
  "/register",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const { hotelName, slug, adminName } = req.body as {
      hotelName?: unknown;
      slug?: unknown;
      adminName?: unknown;
    };

    if (typeof hotelName !== "string" || !hotelName.trim()) {
      throw new AppError(400, "hotelName 為必填");
    }
    if (typeof slug !== "string" || !slug.trim()) {
      throw new AppError(400, "slug 為必填");
    }
    if (typeof adminName !== "string" || !adminName.trim()) {
      throw new AppError(400, "adminName 為必填");
    }

    const auth = req.supabaseAuth!;

    const result = await registerHotel({
      supabaseUserId: auth.id,
      email: auth.email,
      hotelName,
      slug,
      adminName,
      lineUserId: auth.lineSub,
    });

    res.status(201).json(result);
  }),
);

/**
 * GET /api/v1/auth/status
 * 檢查 Supabase 帳號是否已完成 glog 註冊
 */
authRouter.get(
  "/status",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const auth = req.supabaseAuth!;

    const user = await prisma.user.findUnique({
      where: { supabaseUserId: auth.id },
      select: { id: true, email: true, name: true, role: true },
    });

    res.json({ registered: !!user, user });
  }),
);
