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
import { replyToLineUser } from "./lineMessagingService.js";
import { resolveStaffByLineUserId } from "./lineUserResolver.js";
import { transcribeAudio } from "./speechToTextService.js";

const ACCEPT_PATTERN = /^接單(\s|$)/;
const COMPLETE_PATTERN = /^完成(\s|$)/;

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

function buildReplyMessage(
  sourceText: string,
  persist: Awaited<ReturnType<typeof persistLineSemanticIntents>>,
): string {
  const lines: string[] = ["✅ 已收到您的訊息"];

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
): Promise<boolean> {
  if (ACCEPT_PATTERN.test(text)) {
    const msg = await acceptDepartmentTaskForUser({
      tenantId: staff.tenantId,
      userId: staff.user.id,
      role: staff.user.role,
      lineUserId,
    });
    await replyToLineUser(lineUserId, msg);
    return true;
  }

  if (COMPLETE_PATTERN.test(text)) {
    const photo = takePendingCompletionPhoto(lineUserId);
    const note = text.replace(COMPLETE_PATTERN, "").trim() || "已完成";

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

  if (await handleTextCommand(sourceText, lineUserId, staff)) return;

  const parsed = await parseLineMessageSemantics(sourceText);

  const hasAnyIntent =
    parsed.has_task || parsed.has_alert || parsed.has_event;

  if (!hasAnyIntent) {
    await replyToLineUser(
      lineUserId,
      `已收到：「${sourceText.slice(0, 80)}」\n\n未辨識出工單、警示或行程，請包含房號與具體事項。\n房務同仁請回覆「接單」認領任務。`,
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

  await replyToLineUser(lineUserId, buildReplyMessage(sourceText, persist));
}

export async function processLineWebhookEvents(events: LineWebhookEvent[]): Promise<void> {
  for (const event of events) {
    try {
      if (event.type !== "message") continue;
      if (event.source?.type !== "user") continue;

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
