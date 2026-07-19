import {
  Department,
  ServiceRequestStatus,
  TicketStatus,
  UserRole,
} from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import {
  DEPARTMENT_LABELS,
  roleToDepartment,
  rolesForDepartment,
} from "../utils/department.js";
import { withTenantScope } from "../utils/tenantScope.js";
import {
  pushMessages,
  replyWithToken,
  type LineMessage,
} from "./crossDept/lineMessaging.js";
import {
  acceptDepartmentTaskForUser,
  acceptEngineeringTicketById,
  acceptServiceRequestById,
  completeServiceRequestById,
  takePendingCompletionPhoto,
} from "./departmentTaskService.js";
import { logChatMessage } from "./chatLogService.js";
import { markNoticeRead } from "./hotelNoticeService.js";
import { resolveStaffByLineUserId } from "./lineUserResolver.js";
import { submitTicketReport } from "./ticketReportService.js";

type NoticeRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  guestRoom: string | null;
  targetDepartment: string | null;
  status: string;
};

type NoticeFlexInput = NoticeRow & {
  creatorName?: string;
  creatorDepartmentLabel?: string;
};

function frontendBaseUrl(): string {
  return (
    process.env.FRONTEND_URL?.trim() ||
    process.env.CORS_ORIGIN?.trim() ||
    "http://localhost:5173"
  );
}

function detailUri(): string {
  return `${frontendBaseUrl().replace(/\/$/, "")}/ticket-history`;
}

/**
 * 新通報 / 今日任務共用 Flex Bubble
 * TASK：立即接單 + 完工結單；MEMO：已閱
 */
export function generateFlexNoticeBubble(
  notice: NoticeFlexInput,
): Record<string, unknown> {
  const isTask = notice.type === "TASK";
  const badgeColor = isTask ? "#2563EB" : "#059669";
  const badgeText = isTask ? "需處理工單" : "純知會照會";
  const roomLabel = notice.guestRoom?.trim()
    ? `${notice.guestRoom.trim()} 號房`
    : "全館公共區域";
  const description = (
    notice.content?.trim() ||
    notice.title ||
    "無詳細說明"
  ).slice(0, 500);
  const creatorLine = `通報人：${notice.creatorName || "系統"}${
    notice.creatorDepartmentLabel
      ? `（${notice.creatorDepartmentLabel}）`
      : ""
  }`;

  const bodyContents: Record<string, unknown>[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: badgeColor,
          cornerRadius: "8px",
          paddingAll: "4px",
          contents: [
            {
              type: "text",
              text: badgeText,
              color: "#FFFFFF",
              size: "xs",
              weight: "bold",
              align: "center",
            },
          ],
        },
      ],
    },
    {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: [
        {
          type: "text",
          text: "通報內容",
          size: "xs",
          color: "#64748B",
          weight: "bold",
        },
        {
          type: "text",
          text: description,
          size: "sm",
          color: "#334155",
          wrap: true,
          margin: "xs",
        },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        {
          type: "text",
          text: creatorLine,
          size: "xs",
          color: "#94A3B8",
          wrap: true,
        },
      ],
    },
  ];

  const footerContents: Record<string, unknown>[] = isTask
    ? [
        {
          type: "button",
          style: "primary",
          color: "#2563EB",
          height: "sm",
          action: {
            type: "postback",
            label: "立即接單",
            data: `action=accept&notice_id=${notice.id}`,
            displayText: "我已按鈕接單，正在前往處理",
          },
        },
        {
          type: "button",
          style: "primary",
          color: "#64748B",
          height: "sm",
          action: {
            type: "postback",
            label: "完工結單",
            data: `action=complete&notice_id=${notice.id}`,
            displayText: "此任務已處理完畢，申請結單",
          },
        },
      ]
    : [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "postback",
            label: "已閱",
            data: `action=read&notice_id=${notice.id}`,
            displayText: "收到，已閱此照會項目",
          },
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: "查看詳情",
            uri: detailUri(),
          },
        },
      ];

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#EEF2F6",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: roomLabel,
          weight: "bold",
          size: "xl",
          color: "#1E293B",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      contents: bodyContents,
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingAll: "12px",
      contents: footerContents,
    },
  };
}

/** 部門任務 Flex（以 service_request_id 接單／結單，給 LINE 對話／網站建立用） */
export function generateDepartmentTaskFlex(params: {
  serviceRequestId: string;
  roomNumber: string;
  title: string;
  description: string;
  creatorName: string;
  departmentLabel: string;
}): Record<string, unknown> {
  const room = params.roomNumber.trim() || "公共區域";
  const roomLabel = /號房$/.test(room) ? room : `${room} 號房`;
  const desc = (params.description || params.title || "無詳細說明").slice(
    0,
    500,
  );

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#0F172A",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: `新${params.departmentLabel}任務`,
          color: "#94A3B8",
          size: "xs",
          weight: "bold",
        },
        {
          type: "text",
          text: roomLabel,
          color: "#FFFFFF",
          size: "xl",
          weight: "bold",
          margin: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: params.title.slice(0, 120),
          size: "md",
          weight: "bold",
          color: "#0F172A",
          wrap: true,
        },
        {
          type: "text",
          text: desc,
          size: "sm",
          color: "#334155",
          wrap: true,
        },
        {
          type: "text",
          text: `通報人：${params.creatorName}`,
          size: "xs",
          color: "#94A3B8",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#2563EB",
          height: "sm",
          action: {
            type: "postback",
            label: "立即接單",
            data: `action=accept&service_request_id=${params.serviceRequestId}`,
            displayText: "我已按鈕接單，正在前往處理",
          },
        },
        {
          type: "button",
          style: "primary",
          color: "#64748B",
          height: "sm",
          action: {
            type: "postback",
            label: "完工結單",
            data: `action=complete&service_request_id=${params.serviceRequestId}`,
            displayText: "此任務已處理完畢，申請結單",
          },
        },
      ],
    },
  };
}

async function pushFlexToLineIds(
  lineIds: string[],
  messages: LineMessage[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  // 逐人 push（與既有文字推播同一路徑），避免 multicast + Flex 在部分環境不顯示
  for (const lineId of lineIds) {
    const ok = await pushMessages(lineId, messages);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/** 新通報即時推播字卡（目標部門逐人 push 文字+Flex + 通報人確認） */
export async function pushNewNoticeNotification(params: {
  tenantId: string;
  notice: {
    id: string;
    type: string;
    title: string;
    content: string | null;
    guestRoom: string | null;
    targetDepartment: string | null;
    status: string;
  };
  creatorUserId: string;
  creatorName: string;
  creatorRole: UserRole;
}): Promise<{ sent: boolean; recipientCount: number }> {
  const deptRaw = params.notice.targetDepartment;
  if (!deptRaw || !(deptRaw in DEPARTMENT_LABELS)) {
    console.warn("[LINE] 新通報缺少有效目標部門，略過 Flex 推播");
    return { sent: false, recipientCount: 0 };
  }

  const department = deptRaw as Department;
  const deptLabel = DEPARTMENT_LABELS[department];
  const deptRoles = rolesForDepartment(department);

  const recipients = await prisma.user.findMany({
    where: withTenantScope(params.tenantId, {
      lineUserId: { not: null },
      role: { in: deptRoles },
    }),
    select: { id: true, lineUserId: true, name: true },
  });

  const lineIds = [
    ...new Set(
      recipients
        .map((u) => u.lineUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const room = params.notice.guestRoom?.trim();
  const roomLabel = room || "公共區域";
  const introText = [
    `📋 新${deptLabel}${params.notice.type === "MEMO" ? "照會" : "任務"}`,
    `📍 ${roomLabel}`,
    `📝 ${params.notice.title}`,
    `👤 通報：${params.creatorName}`,
    "",
    params.notice.type === "TASK"
      ? "請點下方字卡「立即接單」，或回覆「接單」。"
      : "請點下方字卡「已閱」。",
  ].join("\n");

  const flex: LineMessage = {
    type: "flex",
    altText: `新通報：${roomLabel}有新的即時事件`,
    contents: generateFlexNoticeBubble({
      ...params.notice,
      creatorName: params.creatorName,
      creatorDepartmentLabel:
        DEPARTMENT_LABELS[roleToDepartment(params.creatorRole)],
    }),
  };

  let ok = false;
  if (lineIds.length === 0) {
    console.warn(
      `[LINE] ${deptLabel} 無人可推播新通報 Flex（尚無 lineUserId）`,
    );
  } else {
    console.info(
      `[LINE] 推播對象 ${deptLabel}：` +
        recipients.map((r) => r.name).join("、"),
    );
    const result = await pushFlexToLineIds(lineIds, [
      { type: "text", text: introText },
      flex,
    ]);
    ok = result.sent > 0;
    console.info(
      `[LINE] 新通報 文字+Flex → ${deptLabel}：成功 ${result.sent}、失敗 ${result.failed}`,
    );

    // ChatHub：系統推播寫入 chat_messages（綁 notice ticket_id）
    await Promise.all(
      recipients.map((u) =>
        u.lineUserId
          ? logChatMessage({
              tenantId: params.tenantId,
              staffUserId: u.id,
              lineUserId: u.lineUserId,
              sender: "system",
              messageType: "FLEX",
              content: introText,
              ticketId: params.notice.id,
              ticketKind: "NOTICE",
            })
          : Promise.resolve(),
      ),
    );
  }

  // 通報人若非目標部門收件者，另推「已送出」確認
  const creator = await prisma.user.findFirst({
    where: withTenantScope(params.tenantId, { id: params.creatorUserId }),
    select: { lineUserId: true },
  });
  const creatorLineId = creator?.lineUserId?.trim();
  if (creatorLineId && !lineIds.includes(creatorLineId)) {
    const kind = params.notice.type === "MEMO" ? "照會" : "請求";
    const confirmText = [
      `✅ 已送出${deptLabel}${kind}`,
      `📍 ${roomLabel}`,
      `📝 ${params.notice.title}`,
      "",
      params.notice.type === "TASK"
        ? `已通知${deptLabel}接單；完成後會再通知您。`
        : `已通知${deptLabel}同仁閱覽。`,
    ].join("\n");

    const confirmOk = await pushMessages(creatorLineId, [
      { type: "text", text: confirmText },
    ]);
    console.info(
      `[LINE] 通報人確認推播 → ${params.creatorName}：ok=${confirmOk}`,
    );
  }

  return { sent: ok, recipientCount: lineIds.length };
}

/** 部門任務推播（文字 + 可點接單字卡）— 供 LINE 對話／網站建立服務請求 */
export async function pushDepartmentTaskCard(params: {
  tenantId: string;
  department: Department;
  serviceRequestId: string;
  roomNumber: string;
  title: string;
  description: string;
  creatorName: string;
}): Promise<{ sent: number; failed: number }> {
  const deptLabel = DEPARTMENT_LABELS[params.department];
  const deptRoles = rolesForDepartment(params.department);

  const recipients = await prisma.user.findMany({
    where: withTenantScope(params.tenantId, {
      lineUserId: { not: null },
      role: { in: deptRoles },
    }),
    select: { id: true, lineUserId: true, name: true },
  });

  const lineIds = [
    ...new Set(
      recipients
        .map((u) => u.lineUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (lineIds.length === 0) {
    console.warn(`[LINE] ${deptLabel} 無人可推播任務字卡`);
    return { sent: 0, failed: 0 };
  }

  const room = params.roomNumber.trim() || "—";
  const introText = [
    `📋 新${deptLabel}任務`,
    `📍 ${room} 號房`,
    `📝 ${params.title}`,
    `👤 通報：${params.creatorName}`,
    "",
    "請點下方字卡「立即接單」，或回覆「接單」。",
  ].join("\n");

  const flex: LineMessage = {
    type: "flex",
    altText: `新${deptLabel}任務：${room} ${params.title}`,
    contents: generateDepartmentTaskFlex({
      serviceRequestId: params.serviceRequestId,
      roomNumber: room,
      title: params.title,
      description: params.description,
      creatorName: params.creatorName,
      departmentLabel: deptLabel,
    }),
  };

  console.info(
    `[LINE] 推播對象 ${deptLabel}：` + recipients.map((r) => r.name).join("、"),
  );
  const result = await pushFlexToLineIds(lineIds, [
    { type: "text", text: introText },
    flex,
  ]);
  console.info(
    `[LINE] 部門任務 文字+Flex → ${deptLabel}：成功 ${result.sent}、失敗 ${result.failed}`,
  );

  await Promise.all(
    recipients.map((u) =>
      u.lineUserId
        ? logChatMessage({
            tenantId: params.tenantId,
            staffUserId: u.id,
            lineUserId: u.lineUserId,
            sender: "system",
            messageType: "FLEX",
            content: introText,
            ticketId: params.serviceRequestId,
            ticketKind: "SERVICE_REQUEST",
          })
        : Promise.resolve(),
    ),
  );

  return result;
}

export async function listUnreadNoticesForStaff(params: {
  tenantId: string;
  role: UserRole;
}): Promise<NoticeFlexInput[]> {
  const department = roleToDepartment(params.role);
  const now = new Date();

  const rows = await prisma.hotelNotice.findMany({
    where: withTenantScope(params.tenantId, {
      status: "UNREAD",
      targetDepartment: department,
      OR: [
        { type: "TASK" },
        {
          type: "MEMO",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      ],
    }),
    orderBy: { createdAt: "asc" },
    take: 10,
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      guestRoom: true,
      targetDepartment: true,
      status: true,
      createdBy: { select: { name: true, role: true } },
    },
  });

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    content: n.content,
    guestRoom: n.guestRoom,
    targetDepartment: n.targetDepartment,
    status: n.status,
    creatorName: n.createdBy.name,
    creatorDepartmentLabel:
      DEPARTMENT_LABELS[roleToDepartment(n.createdBy.role)],
  }));
}

/** 回覆「查看今日任務」Flex Carousel / Bubble */
export async function replyTodayTasksFlex(params: {
  lineUserId: string;
  replyToken?: string;
}): Promise<boolean> {
  const staff = await resolveStaffByLineUserId(params.lineUserId);
  if (!staff) {
    await replyWithToken(params.replyToken, [
      {
        type: "text",
        text: "系統找不到您的綁定資料，請先以 LINE 登入完成員工登記。",
      },
    ]);
    return true;
  }

  try {
    const notices = await listUnreadNoticesForStaff({
      tenantId: staff.tenantId,
      role: staff.user.role,
    });

    if (notices.length === 0) {
      await replyWithToken(params.replyToken, [
        {
          type: "text",
          text: "太棒了！目前您所屬的部門沒有任何待處理的工單或照會。",
        },
      ]);
      return true;
    }

    const contents =
      notices.length === 1
        ? generateFlexNoticeBubble(notices[0]!)
        : {
            type: "carousel",
            contents: notices.map((n) => generateFlexNoticeBubble(n)),
          };

    const message: LineMessage = {
      type: "flex",
      altText: "glog 營運通知：您有待處理的即時事件",
      contents,
    };

    await replyWithToken(params.replyToken, [message]);
    return true;
  } catch (err) {
    console.error("[LINE] 查看今日任務失敗", err);
    await replyWithToken(params.replyToken, [
      { type: "text", text: "系統暫時無法載入任務，請稍後再試。" },
    ]);
    return true;
  }
}

function parseNoticePostback(data: string): {
  action: "accept" | "read" | "complete" | null;
  noticeId: string | null;
  serviceRequestId: string | null;
} {
  const params = new URLSearchParams(data);
  const actionRaw = params.get("action");
  const action =
    actionRaw === "accept" ||
    actionRaw === "read" ||
    actionRaw === "complete"
      ? actionRaw
      : null;
  return {
    action,
    noticeId: params.get("notice_id"),
    serviceRequestId: params.get("service_request_id"),
  };
}

async function acceptLinkedTaskForNotice(params: {
  tenantId: string;
  userId: string;
  role: UserRole;
  lineUserId: string;
  notice: NoticeRow;
}): Promise<string> {
  const room = params.notice.guestRoom?.trim() || undefined;
  const title = params.notice.title.trim();

  const request = await prisma.serviceRequest.findFirst({
    where: withTenantScope(params.tenantId, {
      status: ServiceRequestStatus.PENDING,
      handledById: null,
      ...(room ? { guestRoom: room } : {}),
      ...(title ? { title } : {}),
    }),
    orderBy: { createdAt: "asc" },
  });

  if (request) {
    const accepted = await acceptServiceRequestById(
      params.tenantId,
      params.userId,
      params.role,
      request.id,
    );
    return `已接單：${accepted.guestRoom} 號房 ${accepted.title}\n請完成後傳照片（如需）並點「完工結單」或回覆「完成」。`;
  }

  if (params.role === UserRole.ENGINEER || params.role === UserRole.ADMIN) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: withTenantScope(params.tenantId, {
        status: TicketStatus.OPEN,
        assignedToId: null,
        ...(title ? { title } : {}),
      }),
      include: { asset: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (ticket) {
      await acceptEngineeringTicketById(
        params.tenantId,
        params.userId,
        params.role,
        ticket.id,
      );
      return `已接單：${ticket.asset.code} ${ticket.title}\n請完成後傳照片並點「完工結單」或回覆「完成」。`;
    }
  }

  return acceptDepartmentTaskForUser({
    tenantId: params.tenantId,
    userId: params.userId,
    role: params.role,
    lineUserId: params.lineUserId,
  });
}

async function completeLinkedTaskForNotice(params: {
  tenantId: string;
  userId: string;
  role: UserRole;
  lineUserId: string;
  notice: NoticeRow;
}): Promise<string> {
  const room = params.notice.guestRoom?.trim() || undefined;
  const title = params.notice.title.trim();
  const photo = takePendingCompletionPhoto(params.lineUserId);
  const note = "已完成";

  const request = await prisma.serviceRequest.findFirst({
    where: withTenantScope(params.tenantId, {
      handledById: params.userId,
      status: ServiceRequestStatus.CONFIRMED,
      ...(room ? { guestRoom: room } : {}),
      ...(title ? { title } : {}),
    }),
    orderBy: { acceptedAt: "desc" },
  });

  if (request) {
    const photoRequired =
      request.targetDepartment !== Department.HOUSEKEEPING;
    if (photoRequired && !photo) {
      throw new AppError(400, "請先傳送完成照片，再點「完工結單」或回覆「完成」");
    }

    await completeServiceRequestById(
      params.tenantId,
      params.userId,
      params.role,
      request.id,
      photo?.buffer ?? null,
      photo?.mimeType ?? null,
      note,
    );
    await markNoticeRead(params.tenantId, params.notice.id);
    return `已完成並通知客務部\n${request.guestRoom} 號房 ${request.title}`;
  }

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: withTenantScope(params.tenantId, {
      assignedToId: params.userId,
      status: { in: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS] },
      ...(title ? { title } : {}),
    }),
    orderBy: { assignedAt: "desc" },
  });

  if (ticket) {
    if (!photo) {
      throw new AppError(400, "請先傳送完成照片，再點「完工結單」或回覆「完成」");
    }
    if (ticket.status === TicketStatus.ASSIGNED) {
      await prisma.maintenanceTicket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }
    await submitTicketReport(
      params.tenantId,
      ticket.id,
      { id: params.userId, role: params.role },
      {
        type: "COMPLETED",
        note,
        photos: [
          {
            data: photo.buffer.toString("base64"),
            mimeType: photo.mimeType || "image/jpeg",
          },
        ],
      },
    );
    await markNoticeRead(params.tenantId, params.notice.id);
    return `工程任務已完成：${ticket.title}`;
  }

  throw new AppError(404, "找不到您進行中的任務，請先點「立即接單」");
}

async function handleServiceRequestPostback(params: {
  staff: NonNullable<Awaited<ReturnType<typeof resolveStaffByLineUserId>>>;
  action: "accept" | "complete";
  serviceRequestId: string;
  lineUserId: string;
  replyToken?: string;
}): Promise<boolean> {
  const request = await prisma.serviceRequest.findFirst({
    where: withTenantScope(params.staff.tenantId, {
      id: params.serviceRequestId,
    }),
  });

  if (!request) {
    await replyWithToken(params.replyToken, [
      { type: "text", text: "找不到此任務，可能已刪除。" },
    ]);
    return true;
  }

  try {
    if (params.action === "accept") {
      const accepted = await acceptServiceRequestById(
        params.staff.tenantId,
        params.staff.user.id,
        params.staff.user.role,
        request.id,
      );
      const replyText = `已接單：${accepted.guestRoom} 號房 ${accepted.title}\n請完成後傳照片（如需）並點「完工結單」或回覆「完成」。`;
      await logChatMessage({
        tenantId: params.staff.tenantId,
        staffUserId: params.staff.user.id,
        lineUserId: params.lineUserId,
        sender: "staff",
        messageType: "POSTBACK",
        content: `[接單] ${accepted.guestRoom} ${accepted.title}`,
        ticketId: request.id,
        ticketKind: "SERVICE_REQUEST",
      });
      await replyWithToken(params.replyToken, [
        { type: "text", text: replyText },
      ]);
      return true;
    }

    // 若尚未接單直接點結單：自動先接單再完工（常見於房務一鍵結案）
    let working = request;
    if (working.status === ServiceRequestStatus.PENDING) {
      working = await acceptServiceRequestById(
        params.staff.tenantId,
        params.staff.user.id,
        params.staff.user.role,
        working.id,
      );
    } else if (working.status !== ServiceRequestStatus.CONFIRMED) {
      throw new AppError(400, "此任務已結案或無法完工");
    }

    const photo = takePendingCompletionPhoto(params.lineUserId);
    const photoRequired =
      working.targetDepartment !== Department.HOUSEKEEPING;
    if (
      working.handledById !== params.staff.user.id &&
      params.staff.user.role !== UserRole.ADMIN
    ) {
      throw new AppError(403, "僅接單人可以結案此任務");
    }
    if (photoRequired && !photo) {
      throw new AppError(400, "請先傳送完成照片，再點「完工結單」");
    }

    await completeServiceRequestById(
      params.staff.tenantId,
      params.staff.user.id,
      params.staff.user.role,
      working.id,
      photo?.buffer ?? null,
      photo?.mimeType ?? null,
      "已完成",
    );
    await logChatMessage({
      tenantId: params.staff.tenantId,
      staffUserId: params.staff.user.id,
      lineUserId: params.lineUserId,
      sender: "staff",
      messageType: "POSTBACK",
      content: `[完工結單] ${working.guestRoom} ${working.title}`,
      ticketId: working.id,
      ticketKind: "SERVICE_REQUEST",
    });
    await replyWithToken(params.replyToken, [
      {
        type: "text",
        text: `已完成並通知客務部\n${working.guestRoom} 號房 ${working.title}`,
      },
    ]);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "操作失敗";
    await replyWithToken(params.replyToken, [
      { type: "text", text: message },
    ]);
    return true;
  }
}

/** Flex 按鈕 postback：立即接單 / 已閱 / 完工結單 */
export async function handleHotelNoticePostback(params: {
  lineUserId: string;
  postbackData: string;
  replyToken?: string;
}): Promise<boolean> {
  const { action, noticeId, serviceRequestId } = parseNoticePostback(
    params.postbackData,
  );
  if (!action) return false;
  if (!noticeId && !serviceRequestId) return false;

  const staff = await resolveStaffByLineUserId(params.lineUserId);
  if (!staff) {
    await replyWithToken(params.replyToken, [
      {
        type: "text",
        text: "您尚未完成員工登記，請先以 LINE 登入綁定身分。",
      },
    ]);
    return true;
  }

  if (serviceRequestId && (action === "accept" || action === "complete")) {
    return handleServiceRequestPostback({
      staff,
      action,
      serviceRequestId,
      lineUserId: params.lineUserId,
      replyToken: params.replyToken,
    });
  }

  if (!noticeId) return false;

  const notice = await prisma.hotelNotice.findFirst({
    where: withTenantScope(staff.tenantId, { id: noticeId }),
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      guestRoom: true,
      targetDepartment: true,
      status: true,
    },
  });

  if (!notice) {
    await replyWithToken(params.replyToken, [
      { type: "text", text: "找不到此事件，可能已刪除或已處理。" },
    ]);
    return true;
  }

  try {
    if (action === "read") {
      if (notice.status === "READ") {
        await replyWithToken(params.replyToken, [
          { type: "text", text: "此事件已處理過，無需重複操作。" },
        ]);
        return true;
      }
      await markNoticeRead(staff.tenantId, notice.id);
      await logChatMessage({
        tenantId: staff.tenantId,
        staffUserId: staff.user.id,
        lineUserId: params.lineUserId,
        sender: "staff",
        messageType: "POSTBACK",
        content: `[已閱] ${notice.title}`,
        ticketId: notice.id,
        ticketKind: "NOTICE",
      });
      await replyWithToken(params.replyToken, [
        { type: "text", text: `已閱：${notice.title.slice(0, 80)}` },
      ]);
      return true;
    }

    if (action === "accept") {
      const msg = await acceptLinkedTaskForNotice({
        tenantId: staff.tenantId,
        userId: staff.user.id,
        role: staff.user.role,
        lineUserId: params.lineUserId,
        notice,
      });
      await logChatMessage({
        tenantId: staff.tenantId,
        staffUserId: staff.user.id,
        lineUserId: params.lineUserId,
        sender: "staff",
        messageType: "POSTBACK",
        content: `[接單] ${notice.title}`,
        ticketId: notice.id,
        ticketKind: "NOTICE",
      });
      await replyWithToken(params.replyToken, [{ type: "text", text: msg }]);
      return true;
    }

    const msg = await completeLinkedTaskForNotice({
      tenantId: staff.tenantId,
      userId: staff.user.id,
      role: staff.user.role,
      lineUserId: params.lineUserId,
      notice,
    });
    await logChatMessage({
      tenantId: staff.tenantId,
      staffUserId: staff.user.id,
      lineUserId: params.lineUserId,
      sender: "staff",
      messageType: "POSTBACK",
      content: `[完工結單] ${notice.title}`,
      ticketId: notice.id,
      ticketKind: "NOTICE",
    });
    await replyWithToken(params.replyToken, [{ type: "text", text: msg }]);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "操作失敗";
    await replyWithToken(params.replyToken, [
      { type: "text", text: message },
    ]);
    return true;
  }
}
