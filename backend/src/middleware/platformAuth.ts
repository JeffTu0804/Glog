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
 * 驗證 Supabase JWT，並確認 public.profiles.role = manager。
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

    const profile = await prisma.authProfile.findUnique({
      where: { id: data.user.id },
    });

    if (profile?.role === "manager") {
      // pass
    } else if (profile?.managerAccessStatus === "pending") {
      throw new AppError(403, "Manager 權限申請待審核");
    } else if (profile?.managerAccessStatus === "rejected") {
      throw new AppError(403, "Manager 權限申請已被拒絕");
    } else {
      throw new AppError(403, "非平台管理員，無法存取營運後台");
    }

    const metadata = data.user.user_metadata as {
      full_name?: string;
      name?: string;
    };
    const displayName =
      metadata.full_name?.trim() ||
      metadata.name?.trim() ||
      data.user.email?.split("@")[0] ||
      "Manager";

    req.platformAdmin = {
      id: data.user.id,
      supabaseUserId: data.user.id,
      email: data.user.email ?? "",
      name: displayName,
    };

    next();
  } catch (err) {
    next(err);
  }
}
