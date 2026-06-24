import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { getSupabase } from "../lib/supabase.js";

export interface PlatformAdminUser {
  id: string;
  supabaseUserId: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      platformAdmin?: PlatformAdminUser;
    }
  }
}

/**
 * 驗證 Supabase JWT 並確認為 glog 平台管理員（PlatformAdmin）。
 * 與租戶員工 authenticate 完全分離，允許跨租戶查詢。
 */
export async function authenticatePlatformAdmin(
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

    const admin = await prisma.platformAdmin.findUnique({
      where: { supabaseUserId: data.user.id },
    });

    if (!admin) {
      throw new AppError(403, "非平台管理員，無法存取營運後台");
    }

    req.platformAdmin = {
      id: admin.id,
      supabaseUserId: admin.supabaseUserId,
      email: admin.email,
      name: admin.name,
    };

    next();
  } catch (err) {
    next(err);
  }
}
