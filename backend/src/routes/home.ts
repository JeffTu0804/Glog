import { HandoverItemType } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseEnumValue } from "../utils/validators.js";
import { getHomeData, toggleHandoverAck } from "../services/homeService.js";

export const homeRouter = Router();

/** GET /api/v1/home — 首頁待辦與上一班交班摘要 */
homeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await getHomeData(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
    );
    res.json(data);
  }),
);

/** POST /api/v1/home/handover-ack — 勾選／取消上一班交班事項 */
homeRouter.post(
  "/handover-ack",
  asyncHandler(async (req, res) => {
    const body = req.body as {
      logbookId?: unknown;
      itemType?: unknown;
      itemIndex?: unknown;
      completed?: unknown;
    };

    if (typeof body.logbookId !== "string" || !body.logbookId.trim()) {
      res.status(400).json({ error: "logbookId 為必填" });
      return;
    }

    if (typeof body.itemIndex !== "number" || !Number.isInteger(body.itemIndex)) {
      res.status(400).json({ error: "itemIndex 必須為整數" });
      return;
    }

    if (typeof body.completed !== "boolean") {
      res.status(400).json({ error: "completed 必須為布林值" });
      return;
    }

    const itemType = parseEnumValue(
      body.itemType,
      Object.values(HandoverItemType),
      "itemType",
    );

    const handoverAcks = await toggleHandoverAck(
      req.user!.tenantId,
      req.user!.id,
      req.user!.role,
      {
        logbookId: body.logbookId.trim(),
        itemType,
        itemIndex: body.itemIndex,
        completed: body.completed,
      },
    );

    res.json({ handoverAcks });
  }),
);
