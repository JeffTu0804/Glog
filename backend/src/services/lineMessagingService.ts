import { Department, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { DEPARTMENT_LABELS, rolesForDepartment } from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";

export interface HandoverPushPayload {
  tenantId: string;
  department: Department;
  shiftLabel: string;
  shiftDate: string;
  shiftWindow: string;
  publishedByName: string;
  aiSummary: string;
  highlights: string[];
  openItems: string[];
}

function getMessagingAccessToken(): string | null {
  return (
    process.env.LINE_MESSAGING_ACCESS_TOKEN?.trim() ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    null
  );
}

function buildHandoverMessage(payload: HandoverPushPayload): string {
  const deptLabel = DEPARTMENT_LABELS[payload.department];
  const lines: string[] = [
    `📋 ${deptLabel}交班通知`,
    `${payload.shiftLabel} · ${payload.shiftDate}`,
    `時段：${payload.shiftWindow}`,
    `交班人：${payload.publishedByName}`,
    "",
  ];

  if (payload.highlights.length > 0) {
    lines.push("【重點】");
    for (const h of payload.highlights.slice(0, 5)) {
      lines.push(`• ${h}`);
    }
    lines.push("");
  }

  if (payload.openItems.length > 0) {
    lines.push("【待追蹤】");
    for (const item of payload.openItems.slice(0, 5)) {
      lines.push(`• ${item}`);
    }
    lines.push("");
  }

  const summary = payload.aiSummary.trim();
  if (summary) {
    lines.push(summary.length > 800 ? `${summary.slice(0, 800)}…` : summary);
  }

  return lines.join("\n");
}

async function pushLineMessage(lineUserId: string, text: string): Promise<void> {
  const token = getMessagingAccessToken();
  if (!token) {
    console.warn("[LINE] 未設定 LINE_MESSAGING_ACCESS_TOKEN，略過交班推播");
    return;
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[LINE] 推播失敗 (${lineUserId}): ${res.status} ${body}`);
  }
}

/** 交班後推播給該部門員工與管理員 */
export async function notifyDepartmentHandover(
  payload: HandoverPushPayload,
): Promise<{ sent: number; skipped: number }> {
  const token = getMessagingAccessToken();
  if (!token) {
    return { sent: 0, skipped: 0 };
  }

  const deptRoles = rolesForDepartment(payload.department);
  const recipients = await prisma.user.findMany({
    where: withTenantScope(payload.tenantId, {
      lineUserId: { not: null },
      OR: [
        { role: { in: deptRoles } },
        { role: UserRole.ADMIN },
      ],
    }),
    select: { lineUserId: true },
  });

  const uniqueLineIds = [
    ...new Set(
      recipients
        .map((u) => u.lineUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (uniqueLineIds.length === 0) {
    return { sent: 0, skipped: 0 };
  }

  const text = buildHandoverMessage(payload);
  let sent = 0;
  let skipped = 0;

  await Promise.all(
    uniqueLineIds.map(async (lineUserId) => {
      try {
        await pushLineMessage(lineUserId, text);
        sent += 1;
      } catch {
        skipped += 1;
      }
    }),
  );

  return { sent, skipped };
}

/** 從 Supabase user_metadata 同步 LINE user ID 到 Prisma User */
export async function syncLineUserId(
  supabaseUserId: string,
  lineSub: string | undefined,
): Promise<void> {
  if (!lineSub?.trim()) return;

  await prisma.user.updateMany({
    where: { supabaseUserId, lineUserId: null },
    data: { lineUserId: lineSub.trim() },
  });

  await prisma.user.updateMany({
    where: { supabaseUserId, NOT: { lineUserId: lineSub.trim() } },
    data: { lineUserId: lineSub.trim() },
  });
}
