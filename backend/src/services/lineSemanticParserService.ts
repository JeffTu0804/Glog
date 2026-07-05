import { parseLineSemanticResult } from "../utils/lineSemanticSchema.js";
import type { LineSemanticParseResult } from "../types/lineWebhook.js";

const EMPTY_RESULT: LineSemanticParseResult = {
  has_task: false,
  task_data: null,
  has_alert: false,
  alert_data: null,
  has_event: false,
  event_data: null,
};

const SYSTEM_PROMPT = `你是飯店前台 LINE 訊息解析助手。將同仁口述或文字訊息解析為結構化 JSON。

規則：
1. 只輸出 JSON，不要 markdown。
2. 同一句可同時有 task、alert、event（各自 has_* 為 true）。
3. 無法判斷的欄位設 has_* 為 false，對應 *_data 可為 null。
4. room_number 只填數字房號（如 304），不含「號房」。
5. assigned_to 填被指派人姓名；未提及則空字串。
6. category 只能是：維修、清潔、客務。
7. alert level：high（緊急客訴/安全）、medium（一般提醒）。
8. event time 盡量用 ISO 8601（台北時間），無法判斷則空字串。

JSON 格式：
{
  "has_task": boolean,
  "task_data": { "room_number": string, "category": "維修"|"清潔"|"客務", "description": string, "assigned_to": string },
  "has_alert": boolean,
  "alert_data": { "room_number": string, "description": string, "level": "high"|"medium" },
  "has_event": boolean,
  "event_data": { "time": string, "title": string, "description": string }
}`;

export async function parseLineMessageSemantics(
  text: string,
): Promise<LineSemanticParseResult> {
  const trimmed = text.trim();
  if (!trimmed) return EMPTY_RESULT;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[LINE Semantic] 未設定 OPENAI_API_KEY，略過 AI 解析");
    return EMPTY_RESULT;
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

    return parseLineSemanticResult(JSON.parse(content));
  } catch (err) {
    console.error("[LINE Semantic] 解析失敗", err);
    return EMPTY_RESULT;
  }
}
