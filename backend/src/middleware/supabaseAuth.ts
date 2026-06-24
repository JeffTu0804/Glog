import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { getSupabase } from "../lib/supabase.js";

export interface SupabaseAuthUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      supabaseAuth?: SupabaseAuthUser;
    }
  }
}

/**
 * 僅驗證 Supabase JWT，不要求 Prisma User 存在。
 * 用於註冊、OAuth 完成資料等流程。
 */
export async function authenticateSupabase(
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

    req.supabaseAuth = {
      id: data.user.id,
      email: data.user.email ?? "",
    };

    next();
  } catch (err) {
    next(err);
  }
}
