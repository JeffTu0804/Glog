import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";

/**
 * 角色權限守衛：限制特定路由僅允許指定角色存取。
 * 必須在 authenticate middleware 之後使用。
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "未經認證"));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError(403, "權限不足，無法存取此資源"));
      return;
    }

    next();
  };
}
