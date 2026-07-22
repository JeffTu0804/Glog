import { Router } from "express";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { authenticatePlatformAdmin } from "../../middleware/platformAuth.js";
import { authenticateSupabase } from "../../middleware/supabaseAuth.js";
import {
  getOwnManagerAccessStatus,
  listPendingManagerAccessRequests,
  requestManagerAccess,
  reviewManagerAccessRequest,
} from "../../services/platformAccessService.js";
import { verifyManagerAccessEmailToken } from "../../services/managerApprovalNotificationService.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getParamId, parseOptionalString, parseRequiredString } from "../../utils/validators.js";

export const platformAccessRequestRouter = Router();

function renderEmailActionResultPage(input: {
  title: string;
  message: string;
  status: "success" | "error";
}) {
  const color = input.status === "success" ? "#166534" : "#b91c1c";
  const background = input.status === "success" ? "#dcfce7" : "#fee2e2";
  const frontendUrl = (process.env.FRONTEND_URL?.trim() || "http://localhost:5173").replace(/\/$/, "");

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${input.title}</title>
  </head>
  <body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;">
    <div style="max-width:560px;margin:64px auto;padding:24px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 8px 32px rgba(15,23,42,0.08);">
        <h1 style="margin:0 0 12px;font-size:24px;">${input.title}</h1>
        <p style="margin:0;padding:16px;border-radius:12px;background:${background};color:${color};line-height:1.7;">
          ${input.message}
        </p>
        <p style="margin:20px 0 0;">
          <a href="${frontendUrl}/manager" style="color:#4f46e5;text-decoration:none;">前往 glog Manager</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
}

platformAccessRequestRouter.get(
  "/me",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const status = await getOwnManagerAccessStatus(req.supabaseAuth!.id);
    res.json({ request: status });
  }),
);

platformAccessRequestRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const accountId = parseRequiredString(
      body.accountId ?? body.supabaseUserId,
      "accountId",
    );
    const email = parseRequiredString(body.email, "email").toLowerCase();
    const name = parseOptionalString(body.name, "name");

    const { findAuthAccountById } = await import(
      "../../services/mongoAuthService.js"
    );
    const account = await findAuthAccountById(accountId);
    if (!account) {
      throw new AppError(404, "找不到剛建立的使用者；請改用其他 Email 或直接登入");
    }
    if (account.email.toLowerCase() !== email) {
      throw new AppError(400, "申請資料與剛建立的帳號不一致");
    }

    const { getAuthUserId } = await import(
      "../../services/mongoAuthService.js"
    );
    const result = await requestManagerAccess({
      supabaseUserId: getAuthUserId(account),
      email,
      name,
    });

    res.status(201).json(result);
  }),
);

platformAccessRequestRouter.post(
  "/",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: unknown };
    const result = await requestManagerAccess({
      supabaseUserId: req.supabaseAuth!.id,
      email: req.supabaseAuth!.email,
      name: typeof name === "string" ? name : undefined,
    });
    res.status(201).json(result);
  }),
);

platformAccessRequestRouter.get(
  "/:id/email-action",
  asyncHandler(async (req, res) => {
    const userId = getParamId(req.params, "申請者 ID");
    const action = req.query.action;
    const token = req.query.token;

    if ((action !== "approve" && action !== "reject") || typeof token !== "string") {
      res
        .status(400)
        .type("html")
        .send(
          renderEmailActionResultPage({
            title: "連結無效",
            message: "Email 內的審核連結格式不正確，請回到 Manager 後台手動處理。",
            status: "error",
          }),
        );
      return;
    }

    const payload = verifyManagerAccessEmailToken(token, { userId, action });
    if (!payload) {
      res
        .status(403)
        .type("html")
        .send(
          renderEmailActionResultPage({
            title: "連結已失效",
            message: "這個審核連結已失效或已過期，請回到 Manager 後台查看待審核清單。",
            status: "error",
          }),
        );
      return;
    }

    const reviewer = await prisma.authProfile.findUnique({
      where: { id: payload.reviewerId },
      select: { role: true },
    });
    if (!reviewer || reviewer.role !== "manager") {
      res
        .status(403)
        .type("html")
        .send(
          renderEmailActionResultPage({
            title: "無法審核",
            message: "此連結對應的 Manager 權限已失效，請改由目前的 Manager 後台處理。",
            status: "error",
          }),
        );
      return;
    }

    try {
      await reviewManagerAccessRequest({
        userId,
        reviewerId: payload.reviewerId,
        decision: action,
      });

      res
        .status(200)
        .type("html")
        .send(
          renderEmailActionResultPage({
            title: action === "approve" ? "已核准申請" : "已拒絕申請",
            message:
              action === "approve"
                ? "這位使用者已被核准為 Manager，可以直接登入 Manager 後台。"
                : "這位使用者的 Manager 權限申請已被拒絕。",
            status: "success",
          }),
        );
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : "處理申請時發生錯誤，請回到 Manager 後台確認。";
      res
        .status(error instanceof AppError ? error.statusCode : 500)
        .type("html")
        .send(
          renderEmailActionResultPage({
            title: "申請無法處理",
            message,
            status: "error",
          }),
        );
    }
  }),
);

platformAccessRequestRouter.get(
  "/",
  authenticatePlatformAdmin,
  asyncHandler(async (req, res) => {
    const requests = await listPendingManagerAccessRequests();
    res.json({ requests });
  }),
);

platformAccessRequestRouter.patch(
  "/:id",
  authenticatePlatformAdmin,
  asyncHandler(async (req, res) => {
    const reviewer = req.platformAdmin;
    if (!reviewer) {
      throw new AppError(403, "非平台管理員，無法審核申請");
    }
    const { decision } = req.body as { decision?: unknown };
    if (decision !== "approve" && decision !== "reject") {
      throw new AppError(400, "decision 必須為 approve 或 reject");
    }

    const request = await reviewManagerAccessRequest({
      userId: getParamId(req.params, "申請者 ID"),
      reviewerId: reviewer.id,
      decision,
    });

    res.json({ request });
  }),
);
