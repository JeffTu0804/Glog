import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "伺服器內部錯誤" });
}
