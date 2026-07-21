import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { verifyAuthToken } from "../lib/jwt.js";
import { findAuthAccountById } from "../services/mongoAuthService.js";

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
 * 驗證 Mongo Auth JWT，並確認帳號具 Manager 權限。
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
    const payload = verifyAuthToken(token);
    const account = await findAuthAccountById(payload.sub);
    if (!account) {
      throw new AppError(401, "無效或已過期的 token");
    }

    const isManager =
      account.portalRole === "manager" ||
      account.managerAccessStatus === "approved";

    if (isManager) {
      // pass
    } else if (account.managerAccessStatus === "pending") {
      throw new AppError(403, "Manager 權限申請待審核");
    } else if (account.managerAccessStatus === "rejected") {
      throw new AppError(403, "Manager 權限申請已被拒絕");
    } else {
      throw new AppError(403, "非平台管理員，無法存取營運後台");
    }

    req.platformAdmin = {
      id: String(account._id),
      supabaseUserId: String(account._id),
      email: account.email,
      name: account.name?.trim() || account.email.split("@")[0] || "Manager",
    };

    next();
  } catch (err) {
    next(err);
  }
}
