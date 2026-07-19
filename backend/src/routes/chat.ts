import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import {
  listActiveTicketsForStaff,
  listChatMessages,
  listChatThreads,
  logChatMessage,
} from "../services/chatLogService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const chatRouter = Router();

function staffUserIdParam(params: { staffUserId?: string }): string {
  const id =
    typeof params.staffUserId === "string" ? params.staffUserId.trim() : "";
  if (!id) throw new AppError(400, "缺少員工 ID");
  return id;
}

/** GET /api/v1/chat/threads — 左側員工對話列表 */
chatRouter.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const threads = await listChatThreads(tenantId);
    res.json({ hotelName: tenant?.name ?? "glog", threads });
  }),
);

/** GET /api/v1/chat/threads/:staffUserId/messages */
chatRouter.get(
  "/threads/:staffUserId/messages",
  asyncHandler(async (req, res) => {
    const staffUserId = staffUserIdParam(req.params);
    const messages = await listChatMessages(req.user!.tenantId, staffUserId);
    res.json({ messages });
  }),
);

/** GET /api/v1/chat/threads/:staffUserId/tickets — 右側進行中／待處理工單 */
chatRouter.get(
  "/threads/:staffUserId/tickets",
  asyncHandler(async (req, res) => {
    const staffUserId = staffUserIdParam(req.params);
    const tickets = await listActiveTicketsForStaff(
      req.user!.tenantId,
      staffUserId,
    );
    res.json({ tickets });
  }),
);

/**
 * POST /api/v1/chat/threads/:staffUserId/messages
 * Body: { content } — 經理從中控台回覆（寫入 chat_messages）
 */
chatRouter.post(
  "/threads/:staffUserId/messages",
  asyncHandler(async (req, res) => {
    const staffUserId = staffUserIdParam(req.params);
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) throw new AppError(400, "請填寫訊息內容");

    await logChatMessage({
      tenantId: req.user!.tenantId,
      staffUserId,
      sender: "manager",
      messageType: "TEXT",
      content,
      ticketId:
        typeof req.body?.ticketId === "string" ? req.body.ticketId : null,
      ticketKind:
        typeof req.body?.ticketKind === "string" ? req.body.ticketKind : null,
    });

    res.status(201).json({ ok: true });
  }),
);
