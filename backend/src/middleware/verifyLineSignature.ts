import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";

/**
 * 驗證 LINE Webhook x-line-signature（需搭配 express.raw 取得原始 body）
 */
export function verifyLineSignature(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!channelSecret) {
    next(new AppError(500, "LINE_CHANNEL_SECRET 未設定"));
    return;
  }

  const signature = req.header("x-line-signature");
  if (!signature) {
    next(new AppError(401, "缺少 x-line-signature"));
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : "");

  const digest = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const expected = Buffer.from(signature);
  const actual = Buffer.from(digest);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    next(new AppError(401, "LINE Webhook 簽章驗證失敗"));
    return;
  }

  next();
}
