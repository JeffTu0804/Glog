/**
 * Supabase Edge Function — LINE Webhook（核心中樞 + 跨部門路由）
 *
 * Deploy:
 *   supabase functions deploy line-webhook --no-verify-jwt
 *
 * Secrets:
 *   LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY（Edge 通常自動注入）
 *   LIFF_BIND_URL
 *
 * 核心中樞流程（對齊 glog.md Adapter Pattern）：
 *   1. LINE Adapter → GlogIncomingMessage
 *   2. 查 DB：userId → 哪家飯店（User.lineUserId / employees）
 *   3. 有飯店上下文後才進入業務處理
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-line-signature",
};

type Dept =
  | "front_desk"
  | "housekeeping"
  | "engineering"
  | "purchasing"
  | "spa";

const DEPT_LABELS: Record<Dept, string> = {
  front_desk: "前台",
  housekeeping: "房務",
  engineering: "工程",
  purchasing: "採購",
  spa: "SPA",
};

/** glog.md — 統一進線格式（平台無關） */
interface GlogIncomingMessage {
  platform: "line" | "whatsapp";
  userId: string;
  messageType: string;
  text: string;
  metadata?: {
    replyToken?: string;
    postbackData?: string;
    rawEventType?: string;
    [key: string]: unknown;
  };
}

/** 核心中樞解析出的飯店上下文（多租戶隔離鍵） */
interface HotelContext {
  hotelId: string;
  hotelName: string;
  tenantId: string;
  source: "user" | "employee";
  staffName: string;
  department: string | null;
  /** employees 表（跨部門派工） */
  employeeId: string | null;
  /** User 表（正式 onboarding） */
  userId: string | null;
  userRole: string | null;
}

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

function getEnv(key: string): string {
  return Deno.env.get(key)?.trim() ?? "";
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function supabaseAdmin(): SupabaseClient {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function verifyLineSignature(
  body: string,
  signature: string | null,
): Promise<boolean> {
  const secret = getEnv("LINE_CHANNEL_SECRET");
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return toBase64(mac) === signature;
}

/**
 * replyToken：免費回覆（每個 event 限用一次，最多 5 則）。
 * 優先消耗 replyToken，避免對同一使用者再打 push 浪費額度。
 */
async function reply(replyToken: string | undefined, messages: unknown[]) {
  if (!replyToken) return;
  const token = getEnv("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) {
    console.warn("[line-webhook] LINE_CHANNEL_ACCESS_TOKEN missing");
    return;
  }
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
}

async function multicast(to: string[], messages: unknown[]) {
  if (to.length === 0) return;
  const token = getEnv("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) return;
  for (let i = 0; i < to.length; i += 500) {
    await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: to.slice(i, i + 500),
        messages: messages.slice(0, 5),
      }),
    });
  }
}

function getLiffBindUrl(): string {
  return (
    getEnv("LIFF_BIND_URL") ||
    "https://liff.line.me/"
  );
}

// ---------------------------------------------------------------------------
// Adapter：LINE Webhook event → GlogIncomingMessage
// ---------------------------------------------------------------------------

function adaptLineEvent(event: LineEvent): GlogIncomingMessage | null {
  const userId = event.source?.userId;
  if (!userId || event.source?.type !== "user") return null;

  if (event.type === "postback" && event.postback?.data) {
    return {
      platform: "line",
      userId,
      messageType: "postback",
      text: "",
      metadata: {
        replyToken: event.replyToken,
        postbackData: event.postback.data,
        rawEventType: event.type,
      },
    };
  }

  if (event.type === "follow") {
    return {
      platform: "line",
      userId,
      messageType: "follow",
      text: "",
      metadata: {
        replyToken: event.replyToken,
        rawEventType: event.type,
      },
    };
  }

  if (event.type === "message" && event.message?.type === "text") {
    return {
      platform: "line",
      userId,
      messageType: "text",
      text: event.message.text?.trim() ?? "",
      metadata: {
        replyToken: event.replyToken,
        rawEventType: event.type,
      },
    };
  }

  // 其他訊息類型先轉成通用格式，仍先做飯店歸屬檢查
  if (event.type === "message") {
    return {
      platform: "line",
      userId,
      messageType: event.message?.type ?? "message",
      text: "",
      metadata: {
        replyToken: event.replyToken,
        rawEventType: event.type,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 核心中樞：userId → 哪家飯店
// ---------------------------------------------------------------------------

/**
 * 收到任何訊息後的第一步：用 line userId 查 Supabase，解析所屬飯店。
 *
 * 查詢順序（對齊 glog.md 多租戶）：
 * 1. "User".lineUserId → tenantId → hotels（正式 onboarding 員工）
 * 2. employees.line_user_id → hotel_id（LIFF 快速綁定）
 */
async function resolveHotelByLineUserId(
  db: SupabaseClient,
  lineUserId: string,
): Promise<HotelContext | null> {
  // 1) 正式員工：User ↔ Tenant ↔ hotels
  const { data: user, error: userErr } = await db
    .from("User")
    .select("id, name, role, tenantId, lineUserId")
    .eq("lineUserId", lineUserId)
    .maybeSingle();

  if (userErr) {
    console.error("[line-webhook] User lookup failed", userErr.message);
  }

  if (user?.tenantId) {
    const { data: hotel } = await db
      .from("hotels")
      .select("id, name, tenant_id")
      .eq("tenant_id", user.tenantId)
      .maybeSingle();

    let hotelName = hotel?.name ?? "";
    if (!hotelName) {
      const { data: tenant } = await db
        .from("Tenant")
        .select("id, name, slug")
        .eq("id", user.tenantId)
        .maybeSingle();
      hotelName = tenant?.name ?? "未知飯店";
    }

    // 同步查 employees（同 line id）以便跨部門派工有 employeeId
    const { data: emp } = await db
      .from("employees")
      .select("id, hotel_id, name, department")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    return {
      hotelId: hotel?.id ?? emp?.hotel_id ?? user.tenantId,
      hotelName,
      tenantId: user.tenantId,
      source: "user",
      staffName: user.name,
      department: emp?.department ?? null,
      employeeId: emp?.id ?? null,
      userId: user.id,
      userRole: user.role,
    };
  }

  // 2) LIFF 綁定員工：employees
  const { data: employee, error: empErr } = await db
    .from("employees")
    .select("id, line_user_id, hotel_id, name, department")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (empErr) {
    console.error("[line-webhook] employees lookup failed", empErr.message);
  }

  if (!employee) return null;

  // hotel_id 可能是 hotels.id 或 tenant slug/id
  const { data: hotelById } = await db
    .from("hotels")
    .select("id, name, tenant_id")
    .eq("id", employee.hotel_id)
    .maybeSingle();

  return {
    hotelId: employee.hotel_id,
    hotelName: hotelById?.name ?? employee.hotel_id,
    tenantId: hotelById?.tenant_id ?? employee.hotel_id,
    source: "employee",
    staffName: employee.name,
    department: employee.department,
    employeeId: employee.id,
    userId: null,
    userRole: null,
  };
}

function buildBindPrompt(hotelHint?: string): unknown[] {
  const liff = getLiffBindUrl();
  const lines = [
    "您尚未綁定 glog 飯店身分。",
    hotelHint ? `（查無對應紀錄）` : "",
    "請先完成員工登記或開啟 Bind Identity。",
  ].filter(Boolean);

  if (liff && !liff.endsWith("line.me/")) {
    return [
      {
        type: "flex",
        altText: "請綁定 glog 員工身分",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "歡迎加入 glog", weight: "bold", size: "lg" },
              {
                type: "text",
                text: lines.join("\n"),
                size: "sm",
                color: "#64748B",
                wrap: true,
                margin: "md",
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#0284C7",
                action: { type: "uri", label: "Bind Identity", uri: liff },
              },
            ],
          },
        },
      },
    ];
  }

  return [{ type: "text", text: lines.join("\n") }];
}

function buildTicketFlex(params: {
  ticketId: string;
  caseNumber?: string | null;
  from: Dept;
  to: Dept;
  creatorName: string;
  description: string;
  hotelName: string;
}) {
  const caseLabel = params.caseNumber ? `#${params.caseNumber}` : "";
  return {
    type: "flex",
    altText: `跨部門任務：${DEPT_LABELS[params.from]} → ${DEPT_LABELS[params.to]}${caseLabel ? ` ${caseLabel}` : ""}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text",
            text: params.hotelName,
            color: "#94A3B8",
            size: "xs",
          },
          {
            type: "text",
            text: caseLabel
              ? `工單 ${caseLabel}`
              : `${DEPT_LABELS[params.from]} → ${DEPT_LABELS[params.to]}`,
            color: "#FFFFFF",
            weight: "bold",
            size: "lg",
            margin: "sm",
          },
          ...(caseLabel
            ? [
                {
                  type: "text",
                  text: `${DEPT_LABELS[params.from]} → ${DEPT_LABELS[params.to]}`,
                  color: "#CBD5E1",
                  size: "xs",
                  margin: "sm",
                },
              ]
            : []),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `發起人：${params.creatorName}`,
            size: "sm",
            color: "#64748B",
          },
          {
            type: "text",
            text: params.description,
            size: "sm",
            wrap: true,
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#16A34A",
            action: {
              type: "postback",
              label: "✅ Done",
              data: `action=complete&ticket_id=${params.ticketId}`,
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "❌ Delayed",
              data: `action=delay&ticket_id=${params.ticketId}`,
            },
          },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// LINE 關鍵字：接單 / 結案（防呆 + FIFO）
// DB status: pending | processing | completed | delayed
// ---------------------------------------------------------------------------

const LINE_ACCEPT_KEYWORD = "接單";
const LINE_COMPLETE_KEYWORDS = new Set(["此單已完成", "已結束"]);

async function acceptTicketByKeyword(
  db: SupabaseClient,
  hotel: HotelContext,
): Promise<string> {
  if (!hotel.employeeId || !hotel.department) {
    return "您尚未完成跨部門員工綁定（部門），請先 Bind Identity。";
  }

  const { data: inProgress } = await db
    .from("tickets")
    .select("id, case_number")
    .eq("hotel_id", hotel.hotelId)
    .eq("handled_by_employee_id", hotel.employeeId)
    .eq("status", "processing")
    .maybeSingle();

  if (inProgress) {
    return "⚠️ 您目前已有一案正在處理中，請完成該案後再接新單！";
  }

  const { data: pending } = await db
    .from("tickets")
    .select("id, case_number")
    .eq("hotel_id", hotel.hotelId)
    .eq("to_department", hotel.department)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return "✨ 太棒了！目前沒有待處理的工單，好好休息一下吧！";
  }

  const { error } = await db
    .from("tickets")
    .update({
      status: "processing",
      handled_by_employee_id: hotel.employeeId,
    })
    .eq("id", pending.id)
    .eq("hotel_id", hotel.hotelId)
    .eq("status", "pending");

  if (error) {
    console.error("[line-webhook] accept ticket failed", error);
    return "接單失敗，請稍後再試。";
  }

  const label = pending.case_number ?? pending.id.slice(0, 8);
  return `✅ 接單成功！請前往處理工單：${label}。`;
}

async function completeTicketByKeyword(
  db: SupabaseClient,
  hotel: HotelContext,
): Promise<string> {
  if (!hotel.employeeId) {
    return "您尚未完成跨部門員工綁定，請先 Bind Identity。";
  }

  const { data: inProgress } = await db
    .from("tickets")
    .select("id, case_number")
    .eq("hotel_id", hotel.hotelId)
    .eq("handled_by_employee_id", hotel.employeeId)
    .eq("status", "processing")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!inProgress) {
    return "❓ 系統查不到您目前有接任何工單喔！";
  }

  const { error } = await db
    .from("tickets")
    .update({
      status: "completed",
      delay_reason: null,
    })
    .eq("id", inProgress.id)
    .eq("hotel_id", hotel.hotelId)
    .eq("status", "processing");

  if (error) {
    console.error("[line-webhook] complete ticket failed", error);
    return "結案失敗，請稍後再試。";
  }

  const label = inProgress.case_number ?? inProgress.id.slice(0, 8);
  return `🎉 辛苦了！工單 ${label} 已於 Glog 系統同步結案。`;
}

// ---------------------------------------------------------------------------
// 核心中樞：處理已解析飯店的訊息
// ---------------------------------------------------------------------------

async function handleCoreMessage(
  db: SupabaseClient,
  incoming: GlogIncomingMessage,
  hotel: HotelContext,
): Promise<void> {
  const replyToken = incoming.metadata?.replyToken as string | undefined;

  console.log(
    `[core] hotel=${hotel.hotelName} (${hotel.hotelId}) staff=${hotel.staffName} source=${hotel.source} type=${incoming.messageType}`,
  );

  // follow：已綁定則歡迎
  if (incoming.messageType === "follow") {
    await reply(replyToken, [
      {
        type: "text",
        text: `歡迎回來，${hotel.staffName}！\n🏨 ${hotel.hotelName}\n\n支援指令：\n・派工 採購 說明內容\n・接單\n・此單已完成 / 已結束`,
      },
    ]);
    return;
  }

  // Postback：跨部門 tickets / 房務 ServiceRequest / HotelNotice
  if (incoming.messageType === "postback" && incoming.metadata?.postbackData) {
    const params = new URLSearchParams(String(incoming.metadata.postbackData));
    const action = params.get("action");
    const ticketId = params.get("ticket_id");
    const serviceRequestId = params.get("service_request_id");
    const noticeId = params.get("notice_id");

    // --- 營運工單：ServiceRequest（房務／客務 Flex）---
    if (
      serviceRequestId &&
      (action === "accept" || action === "complete") &&
      hotel.userId &&
      hotel.tenantId
    ) {
      const { data: reqRow, error: reqErr } = await db
        .from("ServiceRequest")
        .select("id, status, title, guestRoom, handledById, targetDepartment")
        .eq("id", serviceRequestId)
        .eq("tenantId", hotel.tenantId)
        .maybeSingle();

      if (reqErr || !reqRow) {
        await reply(replyToken, [
          { type: "text", text: "找不到此任務，可能已刪除。" },
        ]);
        return;
      }

      if (action === "accept") {
        if (reqRow.status !== "PENDING" || reqRow.handledById) {
          await reply(replyToken, [
            { type: "text", text: "此任務已被接單或已結案。" },
          ]);
          return;
        }
        await db
          .from("ServiceRequest")
          .update({
            status: "CONFIRMED",
            handledById: hotel.userId,
            acceptedAt: new Date().toISOString(),
          })
          .eq("id", serviceRequestId);
        await reply(replyToken, [
          {
            type: "text",
            text: `已接單：${reqRow.guestRoom} 號房 ${reqRow.title}\n請完成後點「完工結單」或回覆「完成」。`,
          },
        ]);
        return;
      }

      // complete：未接單則先自動接單
      if (reqRow.status === "PENDING") {
        await db
          .from("ServiceRequest")
          .update({
            status: "CONFIRMED",
            handledById: hotel.userId,
            acceptedAt: new Date().toISOString(),
          })
          .eq("id", serviceRequestId);
      } else if (reqRow.status !== "CONFIRMED") {
        await reply(replyToken, [
          { type: "text", text: "此任務已結案或無法完工。" },
        ]);
        return;
      } else if (
        reqRow.handledById &&
        reqRow.handledById !== hotel.userId
      ) {
        await reply(replyToken, [
          { type: "text", text: "僅接單人可以結案此任務。" },
        ]);
        return;
      }

      await db
        .from("ServiceRequest")
        .update({
          status: "COMPLETED",
          responseNote: "已完成",
          confirmedAt: new Date().toISOString(),
          handledById: hotel.userId,
        })
        .eq("id", serviceRequestId);

      await reply(replyToken, [
        {
          type: "text",
          text: `已完成並通知客務部\n${reqRow.guestRoom} 號房 ${reqRow.title}`,
        },
      ]);
      return;
    }

    // --- HotelNotice 已閱 / 接單錨點 ---
    if (noticeId && action === "read" && hotel.tenantId) {
      await db
        .from("hotel_notices")
        .update({ status: "READ" })
        .eq("id", noticeId)
        .eq("tenant_id", hotel.tenantId);
      await reply(replyToken, [{ type: "text", text: "已閱此照會。" }]);
      return;
    }

    // --- 跨部門 tickets（需 employees 綁定）---
    if (!ticketId) {
      await reply(replyToken, [
        {
          type: "text",
          text: "無法辨識此按鈕對應的工單，請改回覆「接單」或「完成」。",
        },
      ]);
      return;
    }

    if (!hotel.employeeId) {
      await reply(replyToken, [
        {
          type: "text",
          text: `已辨識您屬於「${hotel.hotelName}」，但尚未完成跨部門員工綁定（employees）。請開啟 Bind Identity。`,
        },
      ]);
      return;
    }

    if (action === "complete") {
      const { data: ticketRow } = await db
        .from("tickets")
        .select("case_number")
        .eq("id", ticketId)
        .eq("hotel_id", hotel.hotelId)
        .maybeSingle();

      await db
        .from("tickets")
        .update({
          status: "completed",
          handled_by_employee_id: hotel.employeeId,
          delay_reason: null,
        })
        .eq("id", ticketId)
        .eq("hotel_id", hotel.hotelId);

      const label = ticketRow?.case_number ?? ticketId.slice(0, 8);
      await reply(replyToken, [
        { type: "text", text: `✅ 工單 ${label} 已標記完成，看板即時更新。` },
      ]);
      return;
    }

    if (action === "delay") {
      await db
        .from("tickets")
        .update({
          status: "delayed",
          handled_by_employee_id: hotel.employeeId,
          delay_reason: "（待補原因）",
        })
        .eq("id", ticketId)
        .eq("hotel_id", hotel.hotelId);

      await reply(replyToken, [
        {
          type: "text",
          text: "❌ 已標記延遲。請再回覆具體原因，或至後台補填。",
        },
      ]);
    }
    return;
  }

  // 文字訊息
  if (incoming.messageType === "text" && incoming.text) {
    const text = incoming.text.trim();

    const isAcceptText =
      text === LINE_ACCEPT_KEYWORD || text.startsWith("我已按鈕接單");
    const isCompleteText =
      LINE_COMPLETE_KEYWORDS.has(text) ||
      text.includes("申請結單") ||
      text.includes("此任務已處理完畢");

    // 優先：正式 onboarding 的 ServiceRequest（房務／客務）
    if ((isAcceptText || isCompleteText) && hotel.userId && hotel.tenantId) {
      if (isAcceptText) {
        const { data: pending } = await db
          .from("ServiceRequest")
          .select("id, title, guestRoom")
          .eq("tenantId", hotel.tenantId)
          .eq("status", "PENDING")
          .is("handledById", null)
          .order("createdAt", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (pending) {
          await db
            .from("ServiceRequest")
            .update({
              status: "CONFIRMED",
              handledById: hotel.userId,
              acceptedAt: new Date().toISOString(),
            })
            .eq("id", pending.id);
          await reply(replyToken, [
            {
              type: "text",
              text: `已接單：${pending.guestRoom} 號房 ${pending.title}\n請完成後點「完工結單」或回覆「完成」。`,
            },
          ]);
          return;
        }
      }

      if (isCompleteText) {
        let { data: inProgress } = await db
          .from("ServiceRequest")
          .select("id, title, guestRoom, status")
          .eq("tenantId", hotel.tenantId)
          .eq("handledById", hotel.userId)
          .eq("status", "CONFIRMED")
          .order("acceptedAt", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!inProgress) {
          const { data: oldestPending } = await db
            .from("ServiceRequest")
            .select("id, title, guestRoom")
            .eq("tenantId", hotel.tenantId)
            .eq("status", "PENDING")
            .is("handledById", null)
            .order("createdAt", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (oldestPending) {
            await db
              .from("ServiceRequest")
              .update({
                status: "CONFIRMED",
                handledById: hotel.userId,
                acceptedAt: new Date().toISOString(),
              })
              .eq("id", oldestPending.id);
            inProgress = {
              ...oldestPending,
              status: "CONFIRMED",
            };
          }
        }

        if (inProgress) {
          await db
            .from("ServiceRequest")
            .update({
              status: "COMPLETED",
              responseNote: "已完成",
              confirmedAt: new Date().toISOString(),
              handledById: hotel.userId,
            })
            .eq("id", inProgress.id);
          await reply(replyToken, [
            {
              type: "text",
              text: `已完成並通知客務部\n${inProgress.guestRoom} 號房 ${inProgress.title}`,
            },
          ]);
          return;
        }
      }
    }

    if (text === LINE_ACCEPT_KEYWORD || text.startsWith("我已按鈕接單")) {
      const message = await acceptTicketByKeyword(db, hotel);
      await reply(replyToken, [{ type: "text", text: message }]);
      return;
    }

    if (
      LINE_COMPLETE_KEYWORDS.has(text) ||
      text.includes("申請結單") ||
      text.includes("此任務已處理完畢")
    ) {
      const message = await completeTicketByKeyword(db, hotel);
      await reply(replyToken, [{ type: "text", text: message }]);
      return;
    }

    const m = text.match(/^(?:派工|派單|通知)\s*([^\s]+)\s+(.+)$/s);
    if (!m) {
      await reply(replyToken, [
        {
          type: "text",
          text: [
            `🏨 ${hotel.hotelName}`,
            `👤 ${hotel.staffName}`,
            "",
            "支援指令：",
            "・派工 採購 說明內容",
            "・接單（FIFO 接最早待處理工單）",
            "・此單已完成 / 已結束",
          ].join("\n"),
        },
      ]);
      return;
    }

    if (!hotel.employeeId || !hotel.department) {
      await reply(replyToken, [
        {
          type: "text",
          text: `已辨識您屬於「${hotel.hotelName}」，請先完成 Bind Identity（部門綁定）後再派工。`,
        },
      ]);
      return;
    }

    const toRaw = m[1].toLowerCase();
    const alias: Record<string, Dept> = {
      採購: "purchasing",
      purchasing: "purchasing",
      工程: "engineering",
      engineering: "engineering",
      房務: "housekeeping",
      housekeeping: "housekeeping",
      前台: "front_desk",
      front_desk: "front_desk",
      spa: "spa",
    };
    const toDept = alias[toRaw];
    if (!toDept) {
      await reply(replyToken, [{ type: "text", text: "無法辨識目標部門。" }]);
      return;
    }

    const fromDept = hotel.department as Dept;
    const description = m[2].trim();

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        hotel_id: hotel.hotelId,
        from_department: fromDept,
        to_department: toDept,
        created_by_employee_id: hotel.employeeId,
        description,
        status: "pending",
      })
      .select("id, case_number")
      .single();

    if (error || !ticket) {
      console.error("[line-webhook] ticket insert failed", error);
      await reply(replyToken, [
        { type: "text", text: "建立任務失敗，請稍後再試。" },
      ]);
      return;
    }

    const { data: peers } = await db
      .from("employees")
      .select("line_user_id")
      .eq("hotel_id", hotel.hotelId)
      .eq("department", toDept);

    const flex = buildTicketFlex({
      ticketId: ticket.id,
      caseNumber: ticket.case_number,
      from: fromDept,
      to: toDept,
      creatorName: hotel.staffName,
      description,
      hotelName: hotel.hotelName,
    });

    const peerRows = (peers ?? []) as Array<{ line_user_id: string }>;
    await multicast(
      peerRows.map((p) => p.line_user_id),
      [flex],
    );
    await reply(replyToken, [
      {
        type: "text",
        text: [
          `✅ [${hotel.hotelName}] 已派送至${DEPT_LABELS[toDept]}（${peers?.length ?? 0} 人）`,
          ticket.case_number ? `🎫 ${ticket.case_number}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!getEnv("LINE_CHANNEL_SECRET")) {
    console.error("[line-webhook] LINE_CHANNEL_SECRET is not set");
    return new Response("server misconfigured: missing LINE_CHANNEL_SECRET", {
      status: 500,
    });
  }

  if (!(await verifyLineSignature(rawBody, signature))) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  const events = payload.events ?? [];
  // LINE Console Verify：空 events，簽名通過即回 200
  if (events.length === 0) {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  const db = supabaseAdmin();

  for (const event of events) {
    try {
      // 1) Adapter：平台事件 → 統一格式
      const incoming = adaptLineEvent(event);
      if (!incoming) continue;

      // 2) 核心中樞第一步：查 DB 這個 userId 屬於哪家飯店
      const hotel = await resolveHotelByLineUserId(db, incoming.userId);

      if (!hotel) {
        console.log(`[core] unbound lineUserId=${incoming.userId}`);
        await reply(
          incoming.metadata?.replyToken as string | undefined,
          buildBindPrompt(),
        );
        continue;
      }

      // 3) 已確認飯店 → 進入業務處理（租戶隔離）
      await handleCoreMessage(db, incoming, hotel);
    } catch (err) {
      console.error("[line-webhook] event failed", err);
      const replyToken = event.replyToken;
      if (replyToken) {
        await reply(replyToken, [
          { type: "text", text: "系統處理時發生錯誤，請稍後再試。" },
        ]);
      }
    }
  }

  return new Response("OK", { status: 200, headers: corsHeaders });
});
