import { ServiceRequestStatus, UserAccountStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";

export type ChatSender = "staff" | "manager" | "system";
export type ChatMessageType = "TEXT" | "FLEX" | "POSTBACK";
export type ChatTicketKind =
  | "SERVICE_REQUEST"
  | "NOTICE"
  | "MAINTENANCE"
  | "CROSS_DEPT";

export async function logChatMessage(params: {
  tenantId: string;
  staffUserId?: string | null;
  lineUserId?: string | null;
  sender: ChatSender;
  messageType: ChatMessageType;
  content: string;
  ticketId?: string | null;
  ticketKind?: ChatTicketKind | null;
}): Promise<void> {
  try {
    await prisma.chatMessage.create({
      data: {
        tenantId: params.tenantId,
        staffUserId: params.staffUserId ?? null,
        lineUserId: params.lineUserId ?? null,
        sender: params.sender,
        messageType: params.messageType,
        content: params.content.slice(0, 4000),
        ticketId: params.ticketId ?? null,
        ticketKind: params.ticketKind ?? null,
      },
    });
  } catch (err) {
    console.error("[ChatLog] 寫入失敗", err);
  }
}

/** 依 lineUserId 解析員工，供推播／postback 寫入 chat_messages */
export async function resolveChatStaff(params: {
  tenantId?: string;
  lineUserId?: string | null;
  userId?: string | null;
}): Promise<{
  tenantId: string;
  staffUserId: string;
  lineUserId: string | null;
  name: string;
  role: string;
} | null> {
  if (params.userId) {
    const user = await prisma.user.findFirst({
      where: {
        id: params.userId,
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        lineUserId: true,
        name: true,
        role: true,
      },
    });
    if (!user) return null;
    return {
      tenantId: user.tenantId,
      staffUserId: user.id,
      lineUserId: user.lineUserId,
      name: user.name,
      role: user.role,
    };
  }

  if (!params.lineUserId) return null;
  const user = await prisma.user.findFirst({
    where: {
      lineUserId: params.lineUserId,
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      lineUserId: true,
      name: true,
      role: true,
    },
  });
  if (!user) return null;
  return {
    tenantId: user.tenantId,
    staffUserId: user.id,
    lineUserId: user.lineUserId,
    name: user.name,
    role: user.role,
  };
}

export async function listChatThreads(tenantId: string) {
  const users = await prisma.user.findMany({
    where: withTenantScope(tenantId, {
      accountStatus: UserAccountStatus.ACTIVE,
      lineUserId: { not: null },
    }),
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
      lineUserId: true,
    },
    orderBy: { name: "asc" },
  });

  const threads = await Promise.all(
    users.map(async (u) => {
      const last = await prisma.chatMessage.findFirst({
        where: withTenantScope(tenantId, { staffUserId: u.id }),
        orderBy: { createdAt: "desc" },
        select: {
          content: true,
          createdAt: true,
          sender: true,
          ticketId: true,
        },
      });
      const unread = await prisma.chatMessage.count({
        where: withTenantScope(tenantId, {
          staffUserId: u.id,
          isRead: false,
          sender: { in: ["staff", "system"] },
        }),
      });
      return {
        staff: u,
        lastMessage: last
          ? {
              content: last.content.slice(0, 80),
              createdAt: last.createdAt.toISOString(),
              sender: last.sender,
              ticketId: last.ticketId,
            }
          : null,
        unreadCount: unread,
      };
    }),
  );

  // 有訊息的排前面
  threads.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? "";
    return bt.localeCompare(at);
  });

  return threads;
}

export async function listChatMessages(
  tenantId: string,
  staffUserId: string,
  take = 100,
) {
  const rows = await prisma.chatMessage.findMany({
    where: withTenantScope(tenantId, { staffUserId }),
    orderBy: { createdAt: "asc" },
    take,
  });

  await prisma.chatMessage.updateMany({
    where: withTenantScope(tenantId, {
      staffUserId,
      isRead: false,
      sender: { in: ["staff", "system"] },
    }),
    data: { isRead: true },
  });

  return rows.map((m) => ({
    id: m.id,
    sender: m.sender as ChatSender,
    messageType: m.messageType as ChatMessageType,
    content: m.content,
    ticketId: m.ticketId,
    ticketKind: m.ticketKind,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function listActiveTicketsForStaff(
  tenantId: string,
  staffUserId: string,
) {
  const user = await prisma.user.findFirst({
    where: withTenantScope(tenantId, { id: staffUserId }),
    select: { role: true },
  });
  if (!user) return [];

  const { roleToDepartment } = await import("../utils/department.js");
  const dept = roleToDepartment(user.role);

  const requests = await prisma.serviceRequest.findMany({
    where: withTenantScope(tenantId, {
      targetDepartment: dept,
      status: {
        in: [ServiceRequestStatus.PENDING, ServiceRequestStatus.CONFIRMED],
      },
      OR: [{ handledById: null }, { handledById: staffUserId }],
    }),
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      createdBy: { select: { name: true } },
    },
  });

  // 去重：同房號 + 同標題（正規化後）的 PENDING/CONFIRMED 只保留最新一筆
  const seen = new Set<string>();
  const deduped = requests.filter((r) => {
    const room = r.guestRoom.replace(/號房$/u, "").trim();
    const title = r.title
      .replace(/號房/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const key = `${room}|${title}|${r.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, 30).map((r) => {
    const room = r.guestRoom.replace(/號房$/u, "").trim() || r.guestRoom;
    return {
      id: r.id,
      kind: "SERVICE_REQUEST" as const,
      title: r.title.replace(/號房\s*號房/u, "號房"),
      description: r.description,
      guestRoom: room,
      status:
        r.status === ServiceRequestStatus.PENDING
          ? ("PENDING" as const)
          : ("IN_PROGRESS" as const),
      // 預設 MEDIUM；僅真緊急／SLA 升級時才標 HIGH（避免中控台全員黃框）
      urgency: "MEDIUM",
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      department: r.targetDepartment,
      createdByName: r.createdBy.name,
    };
  });
}
