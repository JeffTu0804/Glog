import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import {
  buildLineAuthorizeUrl,
  createLineOAuthState,
  createLineSignInLink,
  exchangeLineCode,
  getLineOAuthTarget,
  lineLoginPath,
  verifyLineOAuthState,
  type LineLoginTarget,
} from "../services/lineAuthService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const lineAuthRouter = Router();

function parseLineLoginTarget(raw: unknown): LineLoginTarget {
  if (raw === "platform" || raw === "hotelAdmin") return raw;
  return "hotel";
}

/**
 * GET /api/v1/auth/line/login
 * 導向 LINE 授權頁（不透過 Supabase 內建 provider）
 */
lineAuthRouter.get(
  "/login",
  asyncHandler(async (req, res) => {
    const target = parseLineLoginTarget(req.query.target);
    const state = createLineOAuthState(target);
    res.redirect(buildLineAuthorizeUrl(state));
  }),
);

/**
 * GET /api/v1/auth/line/callback
 * LINE OAuth 回調 → Mongo 帳號 + JWT → 導回前端
 */
lineAuthRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const lineError = typeof req.query.error === "string" ? req.query.error : "";

    const frontendUrl = process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
    const loginPath = lineLoginPath(getLineOAuthTarget(state));

    if (lineError) {
      res.redirect(
        `${frontendUrl}${loginPath}?error=${encodeURIComponent(`LINE 授權失敗：${lineError}`)}`,
      );
      return;
    }

    if (!code) {
      throw new AppError(400, "缺少 LINE authorization code");
    }

    if (!state || !verifyLineOAuthState(state)) {
      throw new AppError(400, "無效的 OAuth state，請重新登入");
    }

    const profile = await exchangeLineCode(code);
    if (!profile.sub) {
      throw new AppError(502, "無法取得 LINE 使用者識別");
    }

    const actionLink = await createLineSignInLink(profile, getLineOAuthTarget(state));
    res.redirect(actionLink);
  }),
);
