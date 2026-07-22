import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { isHotelAdminRole } from "../utils/hotelAdmin.js";

/**
 * 飯店 Admin 閘道：必須已 authenticate，且為 ADMIN 或主管／經理職級。
 * 資料範圍一律使用 req.user.tenantId（不可跨租戶）。
 */
export function requireHotelAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError(401, "未經認證"));
    return;
  }

  if (
    !isHotelAdminRole({
      role: req.user.role,
      positionLevel: req.user.positionLevel,
    })
  ) {
    next(new AppError(403, "僅飯店主管／經理可存取 Admin 後台"));
    return;
  }

  next();
}
