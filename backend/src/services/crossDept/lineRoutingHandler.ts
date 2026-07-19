import { buildBindIdentityFlex } from "./flexMessages.js";
import { replyWithToken, type LineMessage } from "./lineMessaging.js";
import {
  acceptCrossDeptTicketByLineUser,
  completeCrossDeptTicketByLineUser,
  createAndRouteTicket,
  finalizeDelayWithReason,
  findEmployeeByLineUserId,
  handleTicketPostback,
  isLineCompleteKeyword,
  LINE_ACCEPT_KEYWORD,
  parseDispatchCommand,
} from "./ticketService.js";

export interface CrossDeptLineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
}

function getLiffBindUrl(): string {
  const base =
    process.env.LIFF_BIND_URL?.trim() ||
    process.env.LIFF_URL?.trim() ||
    "";
  if (base) return base;
  const frontend =
    process.env.CORS_ORIGIN?.trim() || "http://localhost:5173";
  return `${frontend}/liff/bind`;
}

/**
 * 跨部門工作流 — LINE Webhook 事件處理核心。
 * 可被 Express webhook 或 Supabase Edge Function 呼叫。
 *
 * replyToken 成本策略：
 * 1. follow / 未綁定 / postback 確認 / 派工確認 → 一律 reply（免費）
 * 2. 目標部門廣播 Flex → multicast push（必要付費）
 */
export async function handleCrossDeptLineEvent(
  event: CrossDeptLineEvent,
): Promise<boolean> {
  const lineUserId = event.source?.userId;
  if (!lineUserId || event.source?.type !== "user") return false;

  // --- Follow：發送綁定卡片（replyToken 免費） ---
  if (event.type === "follow") {
    const emp = await findEmployeeByLineUserId(lineUserId);
    if (emp) {
      await replyWithToken(event.replyToken, [
        {
          type: "text",
          text: `歡迎回來，${emp.name}！\n派工格式：派工 採購 說明內容`,
        },
      ]);
    } else {
      await replyWithToken(event.replyToken, [
        buildBindIdentityFlex(getLiffBindUrl()) as LineMessage,
      ]);
    }
    return true;
  }

  // --- Postback：Done / Delayed（replyToken 免費確認） ---
  if (event.type === "postback" && event.postback?.data) {
    return handleTicketPostback({
      lineUserId,
      postbackData: event.postback.data,
      replyToken: event.replyToken,
    });
  }

  if (event.type !== "message" || event.message?.type !== "text") {
    return false;
  }

  const text = event.message.text?.trim() ?? "";
  if (!text) return false;

  // --- 延遲原因回覆 ---
  if (await finalizeDelayWithReason({
    lineUserId,
    reason: text,
    replyToken: event.replyToken,
  })) {
    return true;
  }

  const employee = await findEmployeeByLineUserId(lineUserId);

  // 未綁定：用 reply 引導 LIFF（免費），絕不 push
  if (!employee) {
    if (/綁定|bind|登記/i.test(text)) {
      await replyWithToken(event.replyToken, [
        buildBindIdentityFlex(getLiffBindUrl()) as LineMessage,
      ]);
      return true;
    }
    return false; // 交回既有 orchestrator（可能走 User.lineUserId 流程）
  }

  // --- LINE 關鍵字：接單 / 結案（跨部門）；若無單則交回 User/ServiceRequest 流程 ---
  const isAcceptText =
    text === LINE_ACCEPT_KEYWORD || text.startsWith("我已按鈕接單");
  const isCompleteText =
    isLineCompleteKeyword(text) ||
    text.includes("申請結單") ||
    text.includes("此任務已處理完畢");

  if (isAcceptText) {
    const message = await acceptCrossDeptTicketByLineUser(lineUserId);
    if (/沒有|找不到|尚無/.test(message)) {
      return false;
    }
    await replyWithToken(event.replyToken, [{ type: "text", text: message }]);
    return true;
  }

  if (isCompleteText) {
    const message = await completeCrossDeptTicketByLineUser(lineUserId);
    if (/沒有|找不到|尚無|無法/.test(message)) {
      return false;
    }
    await replyWithToken(event.replyToken, [{ type: "text", text: message }]);
    return true;
  }

  // --- 派工指令 ---
  const dispatch = parseDispatchCommand(text);
  if (dispatch) {
    await createAndRouteTicket({
      creator: employee,
      toDepartment: dispatch.toDepartment,
      description: dispatch.description,
      replyToken: event.replyToken,
    });
    return true;
  }

  return false;
}
