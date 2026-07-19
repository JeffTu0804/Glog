import type { LineWebhookEvent } from "../types/lineWebhook.js";
import { downloadLineMessageContent } from "./lineContentService.js";
import {
  acceptDepartmentTaskForUser,
  completeDepartmentTaskForUser,
  storePendingCompletionPhoto,
  takePendingCompletionPhoto,
} from "./departmentTaskService.js";
import { persistLineSemanticIntents } from "./lineIntentPersistenceService.js";
import { parseLineMessageSemantics } from "./lineSemanticParserService.js";
import {
  addLineLogbookSupplement,
  publishCurrentDepartmentLogbook,
} from "./logbookService.js";
import { DEPARTMENT_LABELS, roleToDepartment } from "../utils/department.js";
import { parseRoutingDepartmentSlugs } from "../utils/routingDecision.js";
import type { RoutingDecision } from "../types/lineWebhook.js";
import {
  handleHotelNoticePostback,
  replyTodayTasksFlex,
} from "./hotelNoticeFlexService.js";
import { replyToLineUser } from "./lineMessagingService.js";
import { resolveStaffByLineUserId } from "./lineUserResolver.js";
import { transcribeAudio } from "./speechToTextService.js";

const ACCEPT_PATTERN = /^接單(\s|$)/;
/** Flex「立即接單」按鈕的 displayText，也視為接單 */
const ACCEPT_DISPLAY_PATTERN = /^我已按鈕接單/;
const COMPLETE_PATTERN = /^完成(\s|$)/;
/** Flex「完工結單」按鈕的 displayText，也視為結案 */
const COMPLETE_DISPLAY_PATTERN =
  /申請結單|此任務已處理完畢|^完工結單$|^此單已完成$|^已結束$/;
const PUBLISH_PATTERN = /^交班(\s|$)/;
const TODAY_TASKS_PATTERN = /^查看今日任務$/;

async function extractTextFromEvent(event: LineWebhookEvent): Promise<string | null> {
  const message = event.message;
  if (!message) return null;

  if (message.type === "text" && message.text?.trim()) {
    return message.text.trim();
  }

  if (message.type === "audio" && message.id) {
    const buffer = await downloadLineMessageContent(message.id);
    return transcribeAudio(buffer, `${message.id}.m4a`);
  }

  return null;
}

function formatRoutingNotice(routing: RoutingDecision): string | null {
  if (routing.visibility !== "shared" || routing.shared_with.length === 0) {
    return null;
  }

  const deptLabels = parseRoutingDepartmentSlugs(routing.shared_with)
    .map((d) => DEPARTMENT_LABELS[d])
    .join("、");

  const urgencyLabel =
    routing.urgency === "high" ? "高" : routing.urgency === "medium" ? "中" : "低";

  return `🔀 已同步至：${deptLabels}\n原因：${routing.reason}（緊急度：${urgencyLabel}）`;
}

function buildReplyMessage(
  sourceText: string,
  persist: Awaited<ReturnType<typeof persistLineSemanticIntents>>,
  routing?: RoutingDecision,
): string {
  const lines: string[] = ["✅ 已記入本班交班日誌"];

  const routingLine = routing ? formatRoutingNotice(routing) : null;
  if (routingLine) lines.push(routingLine);

  if (sourceText.length <= 120) {
    lines.push(`📝 ${sourceText}`);
  } else {
    lines.push(`📝 ${sourceText.slice(0, 120)}…`);
  }

  const created = [...persist.tasks, ...persist.alerts, ...persist.events];
  if (created.length > 0) {
    lines.push("", "已建立：");
    for (const item of created) {
      lines.push(`• ${item}`);
    }
  } else if (persist.errors.length === 0) {
    lines.push("", "未辨識出可建立的任務、警示或行程，請補充房號與具體事項。");
  }

  if (persist.errors.length > 0) {
    lines.push("", "部分項目失敗：");
    for (const err of persist.errors) {
      lines.push(`• ${err}`);
    }
  }

  return lines.join("\n");
}

async function handleImageMessage(
  event: LineWebhookEvent,
  lineUserId: string,
): Promise<boolean> {
  const message = event.message;
  if (message?.type !== "image" || !message.id) return false;

  const staff = await resolveStaffByLineUserId(lineUserId);
  if (!staff) {
    await replyToLineUser(lineUserId, "您尚未完成 glog 員工登記。");
    return true;
  }

  try {
    const buffer = await downloadLineMessageContent(message.id);
    storePendingCompletionPhoto(lineUserId, buffer, "image/jpeg");
    await replyToLineUser(
      lineUserId,
      "📷 已收到照片。\n請回覆「完成」以結案任務（可附說明，例：完成 已補枕頭）。",
    );
  } catch (err) {
    console.error("[LINE Webhook] 圖片下載失敗", err);
    await replyToLineUser(lineUserId, "照片處理失敗，請再試一次。");
  }

  return true;
}

async function handleTextCommand(
  text: string,
  lineUserId: string,
  staff: NonNullable<Awaited<ReturnType<typeof resolveStaffByLineUserId>>>,
  replyToken?: string,
): Promise<boolean> {
  if (TODAY_TASKS_PATTERN.test(text)) {
    return replyTodayTasksFlex({ lineUserId, replyToken });
  }

  if (ACCEPT_PATTERN.test(text) || ACCEPT_DISPLAY_PATTERN.test(text)) {
    const msg = await acceptDepartmentTaskForUser({
      tenantId: staff.tenantId,
      userId: staff.user.id,
      role: staff.user.role,
      lineUserId,
    });
    await replyToLineUser(lineUserId, msg);
    return true;
  }

  if (COMPLETE_PATTERN.test(text) || COMPLETE_DISPLAY_PATTERN.test(text)) {
    const photo = takePendingCompletionPhoto(lineUserId);
    const note = COMPLETE_PATTERN.test(text)
      ? text.replace(COMPLETE_PATTERN, "").trim() || "已完成"
      : "已完成";

    try {
      const msg = await completeDepartmentTaskForUser({
        tenantId: staff.tenantId,
        userId: staff.user.id,
        role: staff.user.role,
        lineUserId,
        photoBuffer: photo?.buffer,
        photoMimeType: photo?.mimeType,
        note,
      });
      if (!photo) {
        await replyToLineUser(lineUserId, msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "結案失敗";
      // 尚未接單就結單：先接單再結案（房務常見）
      if (
        message.includes("請先回覆「接單」") ||
        message.includes("找不到您進行中的任務")
      ) {
        try {
          await acceptDepartmentTaskForUser({
            tenantId: staff.tenantId,
            userId: staff.user.id,
            role: staff.user.role,
            lineUserId,
          });
          const msg2 = await completeDepartmentTaskForUser({
            tenantId: staff.tenantId,
            userId: staff.user.id,
            role: staff.user.role,
            lineUserId,
            photoBuffer: photo?.buffer,
            photoMimeType: photo?.mimeType,
            note,
          });
          await replyToLineUser(lineUserId, msg2);
        } catch (err2) {
          await replyToLineUser(
            lineUserId,
            err2 instanceof Error ? err2.message : "結案失敗",
          );
        }
        return true;
      }
      await replyToLineUser(lineUserId, message);
    }
    return true;
  }

  if (PUBLISH_PATTERN.test(text)) {
    const supplement = text.replace(PUBLISH_PATTERN, "").trim();
    try {
      if (supplement) {
        await addLineLogbookSupplement(
          staff.tenantId,
          staff.user.id,
          staff.user.role,
          supplement,
        );
      }

      const published = await publishCurrentDepartmentLogbook(
        staff.tenantId,
        staff.user.id,
        staff.user.role,
      );

      const deptLabel = DEPARTMENT_LABELS[published.department];
      const lines = [
        `✅ ${deptLabel}交班完成`,
        `📋 ${published.shiftLabel} · ${published.shiftDate}`,
      ];

      if (published.highlights.length > 0) {
        lines.push("", "【重點】");
        for (const h of published.highlights.slice(0, 5)) {
          lines.push(`• ${h}`);
        }
      }

      if (published.openItems.length > 0) {
        lines.push("", "【待追蹤】");
        for (const item of published.openItems.slice(0, 5)) {
          lines.push(`• ${item}`);
        }
      }

      await replyToLineUser(lineUserId, lines.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "交班失敗";
      await replyToLineUser(lineUserId, message);
    }
    return true;
  }

  return false;
}

async function handleMessageEvent(event: LineWebhookEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  if (await handleImageMessage(event, lineUserId)) return;

  const staff = await resolveStaffByLineUserId(lineUserId);
  if (!staff) {
    await replyToLineUser(
      lineUserId,
      "您尚未完成 glog 員工登記。\n請至網站用 LINE 登入並填寫飯店、部門與職位。",
    );
    return;
  }

  let sourceText: string | null = null;
  try {
    sourceText = await extractTextFromEvent(event);
  } catch (err) {
    console.error("[LINE Webhook] 訊息擷取失敗", event.message?.id, err);
    await replyToLineUser(
      lineUserId,
      "語音或訊息處理失敗，請稍後再試或改以文字傳送。",
    );
    return;
  }

  if (!sourceText) {
    await replyToLineUser(lineUserId, "目前支援文字、語音與完成照片，請再試一次。");
    return;
  }

  if (await handleTextCommand(sourceText, lineUserId, staff, event.replyToken))
    return;

  const sourceDepartment = roleToDepartment(staff.user.role);
  const parsed = await parseLineMessageSemantics(sourceText, sourceDepartment);

  await addLineLogbookSupplement(
    staff.tenantId,
    staff.user.id,
    staff.user.role,
    sourceText,
    parsed.routing_decision,
  ).catch((err) => console.error("[LINE Webhook] 交班備註寫入失敗", err));

  const hasAnyIntent =
    parsed.has_task || parsed.has_alert || parsed.has_event;

  if (!hasAnyIntent) {
    const routingLine = formatRoutingNotice(parsed.routing_decision);
    await replyToLineUser(
      lineUserId,
      [
        "📝 已記入本班交班日誌",
        routingLine,
        "",
        `「${sourceText.slice(0, 80)}」`,
        "",
        "若要派工請包含房號與具體事項；交班時請回覆「交班」。",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  const persist = await persistLineSemanticIntents({
    tenantId: staff.tenantId,
    userId: staff.user.id,
    userRole: staff.user.role,
    triggeredByName: staff.user.name,
    parsed,
    sourceText,
  });

  await replyToLineUser(
    lineUserId,
    buildReplyMessage(sourceText, persist, parsed.routing_decision),
  );
}

export async function processLineWebhookEvents(events: LineWebhookEvent[]): Promise<void> {
  for (const event of events) {
    try {
      if (event.source?.type !== "user") continue;

      // 跨部門工作流（follow / postback / 派工）優先，充分使用 replyToken 省 Push 成本
      const { handleCrossDeptLineEvent } = await import(
        "./crossDept/lineRoutingHandler.js"
      );
      // 先處理營運 Flex postback（service_request_id / notice_id），避免被跨部門邏輯吞掉
      if (event.type === "postback" && event.postback?.data) {
        const noticeHandled = await handleHotelNoticePostback({
          lineUserId: event.source.userId!,
          postbackData: event.postback.data,
          replyToken: event.replyToken,
        });
        if (noticeHandled) continue;
      }

      const handled = await handleCrossDeptLineEvent({
        type: event.type,
        replyToken: event.replyToken,
        source: event.source,
        message: event.message,
        postback: event.postback,
      });
      if (handled) continue;

      if (event.type !== "message") continue;
      await handleMessageEvent(event);
    } catch (err) {
      console.error("[LINE Webhook] 單一 event 處理失敗", event.message?.id, err);

      const lineUserId = event.source?.userId;
      if (lineUserId) {
        await replyToLineUser(lineUserId, "系統處理時發生錯誤，請稍後再試或至後台手動建立。");
      }
    }
  }
}
