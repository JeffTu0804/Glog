import { Router } from "express";
import { verifyLineSignature } from "../middleware/verifyLineSignature.js";
import { processLineWebhookEvents } from "../services/lineMessageOrchestrator.js";
import type { LineWebhookBody } from "../types/lineWebhook.js";

export const lineWebhookRouter = Router();

/**
 * POST /api/v1/line/webhook
 * LINE Messaging API Webhook（需 raw body 驗簽）
 */
lineWebhookRouter.post("/", verifyLineSignature, (req, res) => {
  res.sendStatus(200);

  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const body = JSON.parse(raw) as LineWebhookBody;
    const events = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0) return;

    void processLineWebhookEvents(events).catch((err) => {
      console.error("[LINE Webhook] batch 處理失敗", err);
    });
  } catch (err) {
    console.error("[LINE Webhook] body 解析失敗", err);
  }
});
