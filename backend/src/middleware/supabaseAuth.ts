import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { verifyAuthToken } from "../lib/jwt.js";
import { findAuthAccountById } from "../services/mongoAuthService.js";

export interface SupabaseAuthUser {
  id: string;
  email: string;
  lineSub?: string;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      supabaseAuth?: SupabaseAuthUser;
    }
  }
}

/**
 * 驗證 Mongo Auth JWT（介面沿用 supabaseAuth，避免大量路由改名）。
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
    const payload = verifyAuthToken(token);
    const account = await findAuthAccountById(payload.sub);
    if (!account) {
      throw new AppError(401, "無效或已過期的 token");
    }

    req.supabaseAuth = {
      id: String(account._id),
      email: account.email,
      lineSub: account.lineUserId ?? undefined,
      name: account.name || undefined,
    };

    next();
  } catch (err) {
    next(err);
  }
}
