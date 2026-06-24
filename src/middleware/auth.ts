import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { getSupabase } from "../lib/supabase.js";

/**
 * 驗證 Supabase JWT，並從 Prisma User 表載入 tenantId 與 role。
 * 成功後將使用者資訊掛載至 req.user，供後續路由與多租戶過濾使用。
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "缺少或無效的 Authorization 標頭");
    }

    const token = authHeader.slice("Bearer ".length);

    const { data, error } = await getSupabase().auth.getUser(token);

    if (error || !data.user) {
      throw new AppError(401, "無效或已過期的 token");
    }

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: data.user.id },
    });

    if (!dbUser) {
      throw new AppError(403, "使用者尚未在系統中註冊，請聯繫管理員");
    }

    req.user = {
      id: dbUser.id,
      tenantId: dbUser.tenantId,
      supabaseUserId: dbUser.supabaseUserId,
      role: dbUser.role,
      email: dbUser.email,
      name: dbUser.name,
    };

    next();
  } catch (err) {
    next(err);
  }
}
