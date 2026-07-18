import { prisma } from "../../lib/prisma.js";
import { buildCrossDeptTicketFlex } from "./flexMessages.js";
import { multicastMessages, replyWithToken, type LineMessage } from "./lineMessaging.js";
import {
  DEPT_LABELS,
  parseDepartment,
  type CrossDeptDepartment,
  type CrossDeptTicketStatus,
} from "./types.js";

export interface EmployeeRow {
  id: string;
  lineUserId: string;
  hotelId: string;
  name: string;
  department: string;
}

/** 以 line_user_id 識別發送者 */
export async function findEmployeeByLineUserId(
  lineUserId: string,
): Promise<EmployeeRow | null> {
  const emp = await prisma.employee.findUnique({
    where: { lineUserId },
  });
  if (!emp) return null;
  return {
    id: emp.id,
    lineUserId: emp.lineUserId,
    hotelId: emp.hotelId,
    name: emp.name,
    department: emp.department,
  };
}

/** LIFF 身分綁定：寫入 / 更新 employees */
export async function bindEmployeeIdentity(params: {
  lineUserId: string;
  hotelId: string;
  name: string;
  department: CrossDeptDepartment;
}): Promise<EmployeeRow> {
  const emp = await prisma.employee.upsert({
    where: { lineUserId: params.lineUserId },
    create: {
      lineUserId: params.lineUserId,
      hotelId: params.hotelId.trim(),
      name: params.name.trim(),
      department: params.department,
    },
    update: {
      hotelId: params.hotelId.trim(),
      name: params.name.trim(),
      department: params.department,
    },
  });

  return {
    id: emp.id,
    lineUserId: emp.lineUserId,
    hotelId: emp.hotelId,
    name: emp.name,
    department: emp.department,
  };
}

/** 查詢同飯店、目標部門的所有 line_user_id */
export async function listDepartmentLineUserIds(
  hotelId: string,
  department: CrossDeptDepartment,
): Promise<string[]> {
  const rows = await prisma.employee.findMany({
    where: { hotelId, department },
    select: { lineUserId: true },
  });
  return rows.map((r) => r.lineUserId);
}

/**
 * 建立跨部門工單並廣播 Flex 卡片給目標部門全員。
 * - 發起人若有 replyToken：用免費 reply 確認建立成功
 * - 目標部門員工：multicast Push（必要成本）
 */
export async function createAndRouteTicket(params: {
  creator: EmployeeRow;
  toDepartment: CrossDeptDepartment;
  description: string;
  /** 發起人事件的 replyToken — 優先用盡以避免多打一則 Push */
  replyToken?: string;
}): Promise<{ ticketId: string; pushedTo: number }> {
  const fromDepartment = parseDepartment(params.creator.department);
  if (!fromDepartment) {
    throw new Error(`發起人部門無效：${params.creator.department}`);
  }

  const ticket = await prisma.crossDepartmentTicket.create({
    data: {
      hotelId: params.creator.hotelId,
      fromDepartment,
      toDepartment: params.toDepartment,
      createdByEmployeeId: params.creator.id,
      description: params.description.trim(),
      status: "pending",
    },
  });

  const flex = buildCrossDeptTicketFlex({
    ticketId: ticket.id,
    caseNumber: ticket.caseNumber,
    fromDepartment,
    toDepartment: params.toDepartment,
    creatorName: params.creator.name,
    description: ticket.description,
  });

  const recipients = await listDepartmentLineUserIds(
    params.creator.hotelId,
    params.toDepartment,
  );

  // 目標部門廣播（含發起人若屬同部門）
  await multicastMessages(recipients, [flex as LineMessage]);

  // 對發起人用 replyToken 確認（免費），避免再 push 一則「已建立」
  const confirm: LineMessage = {
    type: "text",
    text: [
      `✅ 已派送至${DEPT_LABELS[params.toDepartment]}`,
      ticket.caseNumber ? `🎫 ${ticket.caseNumber}` : "",
      `📋 ${ticket.description.slice(0, 80)}`,
      `👥 已通知 ${recipients.length} 位同仁`,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const replied = await replyWithToken(params.replyToken, [confirm]);
  if (!replied && params.creator.lineUserId) {
    // replyToken 失效才退回 push（盡量不要發生）
    const { pushMessages } = await import("./lineMessaging.js");
    await pushMessages(params.creator.lineUserId, [confirm]);
  }

  return { ticketId: ticket.id, pushedTo: recipients.length };
}

export const LINE_ACCEPT_KEYWORD = "接單";
export const LINE_COMPLETE_KEYWORDS = ["此單已完成", "已結束"] as const;

export function isLineCompleteKeyword(text: string): boolean {
  return (LINE_COMPLETE_KEYWORDS as readonly string[]).includes(text.trim());
}

/**
 * LINE 關鍵字「接單」— 防呆（僅一筆 processing）+ FIFO 接最早 pending
 * DB status: pending → processing，handled_by_employee_id = 接單人
 */
export async function acceptCrossDeptTicketByLineUser(
  lineUserId: string,
): Promise<string> {
  const employee = await findEmployeeByLineUserId(lineUserId);
  if (!employee) {
    return "您尚未綁定身分，請先完成 Bind Identity。";
  }

  const inProgress = await prisma.crossDepartmentTicket.findFirst({
    where: {
      hotelId: employee.hotelId,
      handledByEmployeeId: employee.id,
      status: "processing",
    },
  });

  if (inProgress) {
    return "⚠️ 您目前已有一案正在處理中，請完成該案後再接新單！";
  }

  const pending = await prisma.crossDepartmentTicket.findFirst({
    where: {
      hotelId: employee.hotelId,
      toDepartment: employee.department,
      status: "pending",
    },
    orderBy: { createdAt: "asc" },
  });

  if (!pending) {
    return "✨ 太棒了！目前沒有待處理的工單，好好休息一下吧！";
  }

  const updated = await prisma.crossDepartmentTicket.update({
    where: { id: pending.id },
    data: {
      status: "processing",
      handledByEmployeeId: employee.id,
    },
  });

  const label = updated.caseNumber ?? updated.id.slice(0, 8);
  return `✅ 接單成功！請前往處理工單：${label}。`;
}

/**
 * LINE 關鍵字「此單已完成」/「已結束」— 結案 processing 中的工單
 */
export async function completeCrossDeptTicketByLineUser(
  lineUserId: string,
): Promise<string> {
  const employee = await findEmployeeByLineUserId(lineUserId);
  if (!employee) {
    return "您尚未綁定身分，請先完成 Bind Identity。";
  }

  const inProgress = await prisma.crossDepartmentTicket.findFirst({
    where: {
      hotelId: employee.hotelId,
      handledByEmployeeId: employee.id,
      status: "processing",
    },
    orderBy: { createdAt: "asc" },
  });

  if (!inProgress) {
    return "❓ 系統查不到您目前有接任何工單喔！";
  }

  const updated = await prisma.crossDepartmentTicket.update({
    where: { id: inProgress.id },
    data: {
      status: "completed",
      delayReason: null,
    },
  });

  const label = updated.caseNumber ?? updated.id.slice(0, 8);
  return `🎉 辛苦了！工單 ${label} 已於 Glog 系統同步結案。`;
}

function parsePostbackData(data: string): {
  action: "complete" | "delay" | null;
  ticketId: string | null;
} {
  const params = new URLSearchParams(data);
  const actionRaw = params.get("action");
  const action =
    actionRaw === "complete" || actionRaw === "delay" ? actionRaw : null;
  return { action, ticketId: params.get("ticket_id") };
}

/**
 * 處理 Postback：✅ Done / ❌ Delayed
 * 一律先 replyToken 回覆確認（免費），再寫入 Supabase。
 * Delayed 進入 awaiting_reason 流程時，下則文字訊息會寫入 delay_reason。
 */
const awaitingDelayReason = new Map<
  string,
  { ticketId: string; employeeId: string; at: number }
>();

export function takeAwaitingDelayReason(
  lineUserId: string,
): { ticketId: string; employeeId: string } | null {
  const item = awaitingDelayReason.get(lineUserId);
  if (!item) return null;
  awaitingDelayReason.delete(lineUserId);
  return { ticketId: item.ticketId, employeeId: item.employeeId };
}

export async function handleTicketPostback(params: {
  lineUserId: string;
  postbackData: string;
  replyToken?: string;
}): Promise<boolean> {
  const { action, ticketId } = parsePostbackData(params.postbackData);
  if (!action || !ticketId) return false;

  const handler = await findEmployeeByLineUserId(params.lineUserId);
  if (!handler) {
    await replyWithToken(params.replyToken, [
      {
        type: "text",
        text: "您尚未綁定身分，請先點擊「Bind Identity」完成登記。",
      },
    ]);
    return true;
  }

  const ticket = await prisma.crossDepartmentTicket.findFirst({
    where: { id: ticketId, hotelId: handler.hotelId },
  });

  if (!ticket) {
    await replyWithToken(params.replyToken, [
      { type: "text", text: "找不到此任務，可能已刪除或不屬於您的飯店。" },
    ]);
    return true;
  }

  if (ticket.status === "completed" || ticket.status === "delayed") {
    await replyWithToken(params.replyToken, [
      {
        type: "text",
        text: `此任務已是「${ticket.status}」狀態，無需重複操作。`,
      },
    ]);
    return true;
  }

  if (action === "complete") {
    await prisma.crossDepartmentTicket.update({
      where: { id: ticketId },
      data: {
        status: "completed" satisfies CrossDeptTicketStatus,
        handledByEmployeeId: handler.id,
        delayReason: null,
      },
    });

    // replyToken：免費確認；Realtime 會推到 Dashboard
    await replyWithToken(params.replyToken, [
      {
        type: "text",
        text: `✅ 已標記完成\n📋 ${ticket.description.slice(0, 100)}\n看板將即時更新。`,
      },
    ]);
    return true;
  }

  // action === delay — 先請填延遲原因（文字），仍用 replyToken 免費詢問
  awaitingDelayReason.set(params.lineUserId, {
    ticketId,
    employeeId: handler.id,
    at: Date.now(),
  });
  setTimeout(() => awaitingDelayReason.delete(params.lineUserId), 10 * 60 * 1000);

  await replyWithToken(params.replyToken, [
    {
      type: "text",
      text: "❌ 請回覆延遲原因（下一則文字會寫入看板）：",
    },
  ]);
  return true;
}

/** 收到延遲原因文字後結案 */
export async function finalizeDelayWithReason(params: {
  lineUserId: string;
  reason: string;
  replyToken?: string;
}): Promise<boolean> {
  const pending = takeAwaitingDelayReason(params.lineUserId);
  if (!pending) return false;

  const reason = params.reason.trim();
  if (!reason) {
    awaitingDelayReason.set(params.lineUserId, {
      ticketId: pending.ticketId,
      employeeId: pending.employeeId,
      at: Date.now(),
    });
    await replyWithToken(params.replyToken, [
      { type: "text", text: "原因不可空白，請再回覆一次延遲原因。" },
    ]);
    return true;
  }

  await prisma.crossDepartmentTicket.update({
    where: { id: pending.ticketId },
    data: {
      status: "delayed" satisfies CrossDeptTicketStatus,
      handledByEmployeeId: pending.employeeId,
      delayReason: reason.slice(0, 500),
    },
  });

  await replyWithToken(params.replyToken, [
    {
      type: "text",
      text: `⏱ 已標記延遲\n原因：${reason.slice(0, 120)}\n前台／管理看板將即時顯示。`,
    },
  ]);
  return true;
}

export type TicketListStatusFilter =
  | "all"
  | "pending"
  | "processing"
  | "in_progress"
  | "completed"
  | "delayed";

export interface ListTicketsForHotelFilters {
  /** all | pending | processing/in_progress | completed | delayed；預設 active（非 completed） */
  status?: TicketListStatusFilter | "active";
  /** 對應 tickets.to_department（receiving department） */
  toDepartment?: CrossDeptDepartment;
  /** case_number 模糊搜尋（例：047 → 20260718-047） */
  search?: string;
}

function resolveStatusFilter(
  status: ListTicketsForHotelFilters["status"],
): string[] | undefined {
  switch (status) {
    case "all":
      return undefined;
    case "pending":
      return ["pending"];
    case "processing":
    case "in_progress":
      return ["processing"];
    case "completed":
      return ["completed"];
    case "delayed":
      return ["delayed"];
    case "active":
    default:
      return ["pending", "processing", "delayed"];
  }
}

/** 看板／歷史查詢：一律以 hotelId 隔離，支援狀態 × 部門 × 序號交叉過濾 */
export async function listTicketsForHotel(
  hotelId: string,
  filters: ListTicketsForHotelFilters = {},
) {
  const statuses = resolveStatusFilter(filters.status ?? "active");
  const search = filters.search?.trim();

  return prisma.crossDepartmentTicket.findMany({
    where: {
      hotelId,
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(filters.toDepartment ? { toDepartment: filters.toDepartment } : {}),
      ...(search
        ? { caseNumber: { contains: search, mode: "insensitive" as const } }
        : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true, department: true } },
      handledBy: { select: { id: true, name: true, department: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listActiveTicketsForHotel(hotelId: string) {
  return listTicketsForHotel(hotelId, { status: "active" });
}

/** 解析「派工 採購 需要購買...」類指令 */
export function parseDispatchCommand(text: string): {
  toDepartment: CrossDeptDepartment;
  description: string;
} | null {
  const m = text.match(
    /^(?:派工|派單|通知)\s*([^\s]+)\s+(.+)$/s,
  );
  if (!m?.[1] || !m[2]) return null;
  const toDepartment = parseDepartment(m[1]);
  const description = m[2].trim();
  if (!toDepartment || !description) return null;
  return { toDepartment, description };
}
