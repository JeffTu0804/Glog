import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { isEmailConfigured, sendEmail } from "../lib/email.js";

type ManagerAccessDecision = "approve" | "reject";

interface ActionTokenPayload {
  userId: string;
  reviewerId: string;
  action: ManagerAccessDecision;
  exp: number;
}

interface RequestNotificationInput {
  userId: string;
  email: string;
  name: string | null;
  requestedAt: Date | null;
}

function frontendUrl() {
  return (process.env.FRONTEND_URL?.trim() || "http://localhost:5173").replace(/\/$/, "");
}

function backendUrl() {
  const base =
    process.env.BACKEND_PUBLIC_URL?.trim() || `http://localhost:${process.env.PORT ?? "3000"}`;
  return base.replace(/\/$/, "");
}

function fixedNotificationEmail() {
  const email = process.env.MANAGER_APPROVAL_NOTIFY_TO?.trim().toLowerCase();
  return email || null;
}

function signingSecret() {
  const secret =
    process.env.MANAGER_APPROVAL_LINK_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("缺少 MANAGER_APPROVAL_LINK_SECRET 或 SUPABASE_SERVICE_ROLE_KEY");
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function createActionToken(payload: ActionTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyManagerAccessEmailToken(
  token: string,
  expected: { userId: string; action: ManagerAccessDecision },
) {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as ActionTokenPayload;

    if (
      payload.userId !== expected.userId ||
      payload.action !== expected.action ||
      payload.exp < Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function approvalActionUrl(input: {
  userId: string;
  reviewerId: string;
  action: ManagerAccessDecision;
}) {
  const token = createActionToken({
    ...input,
    exp: Date.now() + 1000 * 60 * 60 * 48,
  });

  return `${backendUrl()}/api/platform/v1/access-requests/${input.userId}/email-action?action=${input.action}&token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getNotificationRecipients() {
  const managers = await prisma.authProfile.findMany({
    where: {
      role: "manager",
      email: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  const fixedEmail = fixedNotificationEmail();
  if (!fixedEmail) {
    return managers;
  }

  const reviewer =
    managers.find((manager) => manager.email?.toLowerCase() === fixedEmail) ?? managers[0] ?? null;

  if (!reviewer) {
    return [];
  }

  return [
    {
      id: reviewer.id,
      email: fixedEmail,
      name: reviewer.name,
    },
  ];
}

export async function notifyManagersOfManagerAccessRequest(
  input: RequestNotificationInput,
) {
  if (!isEmailConfigured()) {
    return {
      sent: false,
      reason: "email_not_configured" as const,
      message: "申請已送出，但系統尚未設定 SMTP，未寄出通知 Email。",
    };
  }

  const recipients = await getNotificationRecipients();
  if (recipients.length === 0) {
    return {
      sent: false,
      reason: "no_manager_recipients" as const,
      message: "申請已送出，但系統中尚無可用來核准申請的 Manager 帳號。",
    };
  }

  const applicantName = input.name?.trim() || "未提供姓名";
  const applicantEmail = input.email.trim().toLowerCase();
  const requestedAt = (input.requestedAt ?? new Date()).toLocaleString("zh-TW", {
    hour12: false,
  });
  const dashboardUrl = `${frontendUrl()}/manager`;

  await Promise.all(
    recipients
      .filter((recipient): recipient is { id: string; email: string; name: string | null } => !!recipient.email)
      .map(async (recipient) => {
        const approveUrl = approvalActionUrl({
          userId: input.userId,
          reviewerId: recipient.id,
          action: "approve",
        });
        const rejectUrl = approvalActionUrl({
          userId: input.userId,
          reviewerId: recipient.id,
          action: "reject",
        });

        const subject = `glog Manager 申請通知：${applicantName}`;
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
            <h2 style="margin-bottom:8px;">新的 Manager 權限申請</h2>
            <p>有一位使用者剛送出 Manager 權限申請，請審核。</p>
            <ul>
              <li><strong>姓名：</strong>${escapeHtml(applicantName)}</li>
              <li><strong>Email：</strong>${escapeHtml(applicantEmail)}</li>
              <li><strong>申請時間：</strong>${escapeHtml(requestedAt)}</li>
            </ul>
            <p style="margin:20px 0;">
              <a href="${approveUrl}" style="display:inline-block;margin-right:12px;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;">直接核准</a>
              <a href="${rejectUrl}" style="display:inline-block;padding:10px 16px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;">直接拒絕</a>
            </p>
            <p>也可以前往後台查看完整申請清單：</p>
            <p><a href="${dashboardUrl}">${dashboardUrl}</a></p>
          </div>
        `;
        const text = [
          "新的 Manager 權限申請",
          `姓名：${applicantName}`,
          `Email：${applicantEmail}`,
          `申請時間：${requestedAt}`,
          "",
          `直接核准：${approveUrl}`,
          `直接拒絕：${rejectUrl}`,
          `Manager 後台：${dashboardUrl}`,
        ].join("\n");

        await sendEmail({
          to: [recipient.email],
          subject,
          html,
          text,
        });
      }),
  );

  return {
    sent: true,
    reason: null,
    message: fixedNotificationEmail()
      ? `已送出 Manager 權限申請，並已寄出通知 Email 到 ${fixedNotificationEmail()}。`
      : "已送出 Manager 權限申請，並已寄出通知 Email 給現有 Manager。",
  };
}
