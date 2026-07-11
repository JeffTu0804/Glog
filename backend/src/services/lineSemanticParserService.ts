import { Department } from "@prisma/client";
import { parseLineSemanticResult } from "../utils/lineSemanticSchema.js";
import {
  inferRoutingFromText,
  normalizeRoutingDecision,
} from "../utils/routingDecision.js";
import type { LineSemanticParseResult } from "../types/lineWebhook.js";

const EMPTY_RESULT: LineSemanticParseResult = {
  has_task: false,
  task_data: null,
  has_alert: false,
  alert_data: null,
  has_event: false,
  event_data: null,
  routing_decision: {
    visibility: "internal",
    shared_with: [],
    reason: "部門內部紀錄",
    urgency: "low",
  },
};

const SYSTEM_PROMPT = `你是飯店後勤 LINE 訊息解析助手。將同仁口述或文字訊息解析為結構化 JSON，並判斷跨部門資訊路由。

規則：
1. 只輸出 JSON，不要 markdown。
2. 同一句可同時有 task、alert、event（各自 has_* 為 true）。
3. 無法判斷的欄位設 has_* 為 false，對應 *_data 可為 null。
4. room_number 只填數字房號（如 304），不含「號房」。
5. assigned_to 填被指派人姓名；未提及則空字串。
6. category 只能是：維修、清潔、客務。
7. alert level：high（緊急客訴/安全）、medium（一般提醒）。
8. event time 盡量用 ISO 8601（台北時間），無法判斷則空字串。

【跨部門資訊路由 routing_decision — 必須輸出】
- visibility: "internal" | "shared"
- shared_with: 部門 slug 陣列，僅在 shared 時填寫，可選值：
  "front_desk"（客務部）、"housekeeping"（房務）、"engineering"（工程）、"fb"（餐飲）
- reason: 簡短說明為何如此路由（繁體中文，一句話）
- urgency: "low" | "medium" | "high"

路由判斷指引（System Prompt Rules）：
1. 若訊息涉及「房間損壞、客訴、VIP 要求、影響住房狀態、跨部門求助」→ visibility 必須為 "shared"，並在 shared_with 加入受影響部門：
   - 設備損壞/漏水/冷氣/維修 → 加 "engineering"
   - 客訴/客人情緒/VIP/需安撫 → 加 "front_desk"
   - 清潔/備品/房務 → 加 "housekeeping"
   - 餐飲/預約用餐 → 加 "fb"
   - 退房/住房/房態/團體退房 → 加 "front_desk" 與 "housekeeping"
2. 若僅為「部門內部庶務、盤點、員工排班、常規巡檢且無異常」→ visibility 為 "internal"，shared_with 為空陣列 []，urgency 通常為 "low"。

JSON 格式：
{
  "has_task": boolean,
  "task_data": { "room_number": string, "category": "維修"|"清潔"|"客務", "description": string, "assigned_to": string },
  "has_alert": boolean,
  "alert_data": { "room_number": string, "description": string, "level": "high"|"medium" },
  "has_event": boolean,
  "event_data": { "time": string, "title": string, "description": string },
  "routing_decision": {
    "visibility": "internal" | "shared",
    "shared_with": ["front_desk", "housekeeping", "engineering", "fb"],
    "reason": "string",
    "urgency": "low" | "medium" | "high"
  }
}`;

export async function parseLineMessageSemantics(
  text: string,
  sourceDepartment?: Department,
): Promise<LineSemanticParseResult> {
  const trimmed = text.trim();
  if (!trimmed) return EMPTY_RESULT;

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    console.warn("[LINE Semantic] 未設定 OPENAI_API_KEY，使用規則降級解析");
    return applyRoutingFallback(trimmed, sourceDepartment ?? Department.FRONT_DESK);
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");

    const parsed = parseLineSemanticResult(JSON.parse(content));

    if (!parsed.routing_decision.reason) {
      parsed.routing_decision = inferRoutingFromText(
        trimmed,
        sourceDepartment ?? Department.FRONT_DESK,
      );
    }

    return parsed;
  } catch (err) {
    console.error("[LINE Semantic] 解析失敗", err);
    return applyRoutingFallback(trimmed, sourceDepartment ?? Department.FRONT_DESK);
  }
}

function applyRoutingFallback(
  text: string,
  sourceDepartment: Department,
): LineSemanticParseResult {
  const routing = inferRoutingFromText(text, sourceDepartment);
  return {
    ...EMPTY_RESULT,
    routing_decision: normalizeRoutingDecision(routing),
  };
}
