import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { verifyAuthToken } from "../lib/jwt.js";
import {
  ensureProfileUuid,
  findAuthAccountById,
  resolveHotelUserIds,
} from "../services/mongoAuthService.js";
import { syncLineUserId } from "../services/lineMessagingService.js";
import { roleToDepartment } from "../utils/department.js";

/**
 * 驗證 Mongo Auth JWT，並從 Prisma User 表載入 tenantId 與 role。
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
    const payload = verifyAuthToken(token);
    const account = await findAuthAccountById(payload.sub);
    if (!account) {
      throw new AppError(401, "無效或已過期的 token");
    }

    const candidateIds = await resolveHotelUserIds(account);
    let dbUser = await prisma.user.findFirst({
      where: { supabaseUserId: { in: candidateIds } },
    });

    if (!dbUser && account.lineUserId) {
      dbUser = await prisma.user.findFirst({
        where: { lineUserId: account.lineUserId },
      });
    }

    if (!dbUser && account.email && !account.email.endsWith("@line.oauth.local")) {
      dbUser = await prisma.user.findFirst({
        where: { email: account.email.toLowerCase() },
      });
    }

    if (!dbUser) {
      throw new AppError(403, "使用者尚未在系統中註冊，請聯繫管理員");
    }

    const authUserId = await ensureProfileUuid(account);

    // 把舊帳號的 supabaseUserId 對齊到穩定 auth UUID，之後查詢更穩
    if (dbUser.supabaseUserId !== authUserId) {
      await prisma.user
        .update({
          where: { id: dbUser.id },
          data: { supabaseUserId: authUserId },
        })
        .catch(() => undefined);
    }

    if (account.lineUserId) {
      void syncLineUserId(authUserId, account.lineUserId);
    }

    req.user = {
      id: dbUser.id,
      tenantId: dbUser.tenantId,
      supabaseUserId: authUserId,
      role: dbUser.role,
      email: dbUser.email,
      name: dbUser.name,
      department: roleToDepartment(dbUser.role),
    };

    next();
  } catch (err) {
    next(err);
  }
}
