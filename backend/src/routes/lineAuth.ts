import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import {
  buildLineAuthorizeUrl,
  createLineOAuthState,
  createLineSignInLink,
  exchangeLineCode,
  getLineOAuthTarget,
  verifyLineOAuthState,
} from "../services/lineAuthService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const lineAuthRouter = Router();

/**
 * GET /api/v1/auth/line/login
 * 導向 LINE 授權頁（不透過 Supabase 內建 provider）
 */
lineAuthRouter.get(
  "/login",
  asyncHandler(async (req, res) => {
    const target =
      typeof req.query.target === "string" && req.query.target === "platform"
        ? "platform"
        : "hotel";
    const state = createLineOAuthState(target);
    res.redirect(buildLineAuthorizeUrl(state));
  }),
);

/**
 * GET /api/v1/auth/line/callback
 * LINE OAuth 回調 → 建立/登入 Supabase 使用者 → 導回前端
 */
lineAuthRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const lineError = typeof req.query.error === "string" ? req.query.error : "";

    const frontendUrl = process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
    const loginPath = getLineOAuthTarget(state) === "platform" ? "/manager/login" : "/login";

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
