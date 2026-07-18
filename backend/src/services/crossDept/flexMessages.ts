import type { CrossDeptDepartment } from "./types.js";
import { DEPT_LABELS } from "./types.js";

/**
 * 跨部門任務 Flex Message 卡片
 * Postback data 格式: action=complete&ticket_id=UUID
 *                   action=delay&ticket_id=UUID
 */
export function buildCrossDeptTicketFlex(params: {
  ticketId: string;
  caseNumber?: string | null;
  fromDepartment: CrossDeptDepartment;
  toDepartment: CrossDeptDepartment;
  creatorName: string;
  description: string;
}): { type: "flex"; altText: string; contents: Record<string, unknown> } {
  const fromLabel = DEPT_LABELS[params.fromDepartment];
  const toLabel = DEPT_LABELS[params.toDepartment];
  const desc =
    params.description.length > 200
      ? `${params.description.slice(0, 200)}…`
      : params.description;
  const caseLabel = params.caseNumber ? `#${params.caseNumber}` : "";

  return {
    type: "flex",
    altText: `跨部門任務：${fromLabel} → ${toLabel}${caseLabel ? ` ${caseLabel}` : ""}`,
    contents: {
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
            text: caseLabel ? `工單 ${caseLabel}` : "跨部門任務",
            color: "#94A3B8",
            size: "xs",
            weight: "bold",
          },
          {
            type: "text",
            text: `${fromLabel} → ${toLabel}`,
            color: "#FFFFFF",
            size: "lg",
            weight: "bold",
            margin: "sm",
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
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "發起人",
                size: "sm",
                color: "#64748B",
                flex: 2,
              },
              {
                type: "text",
                text: params.creatorName,
                size: "sm",
                color: "#0F172A",
                weight: "bold",
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: desc,
            size: "sm",
            color: "#334155",
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
            color: "#16A34A",
            height: "sm",
            action: {
              type: "postback",
              label: "✅ Done",
              data: `action=complete&ticket_id=${params.ticketId}`,
              displayText: "標記完成",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "❌ Delayed",
              data: `action=delay&ticket_id=${params.ticketId}`,
              displayText: "標記延遲",
            },
          },
        ],
      },
    },
  };
}

/** 首次加入 Bot：綁定身分按鈕（開啟 LIFF） */
export function buildBindIdentityFlex(liffUrl: string): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  return {
    type: "flex",
    altText: "請綁定 glog 員工身分",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "歡迎加入 glog",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: "請先綁定飯店、姓名與部門，才能接收跨部門任務通知。",
            size: "sm",
            color: "#64748B",
            wrap: true,
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
            action: {
              type: "uri",
              label: "Bind Identity",
              uri: liffUrl,
            },
          },
        ],
      },
    },
  };
}
