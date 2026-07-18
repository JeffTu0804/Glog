/**
 * LINE Messaging helpers — 優先消耗 replyToken 以節省 Push 配額成本。
 *
 * 計費規則摘要：
 * - reply API：免費（每個 Webhook 事件附帶 1 個 replyToken，可回 1～5 則訊息）
 * - push / multicast：計入月訊息額度（付費）
 *
 * 因此：對「點擊按鈕的當事人」一律用 replyToken 確認；
 * 僅對「同部門其他同事」使用 push / multicast 廣播。
 */

function getAccessToken(): string | null {
  return (
    process.env.LINE_MESSAGING_ACCESS_TOKEN?.trim() ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    null
  );
}

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

async function lineApi(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const token = getAccessToken();
  if (!token) {
    console.warn("[LINE] 未設定 CHANNEL ACCESS TOKEN，略過", path);
    return { ok: false, status: 0, text: "no token" };
  }

  const res = await fetch(`https://api.line.me/v2/bot${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[LINE] ${path} 失敗: ${res.status} ${text}`);
  }
  return { ok: res.ok, status: res.status, text };
}

/**
 * 使用 replyToken 回覆（免費額度）。
 * 每個 token 只能用一次，且約 30 秒內有效 — 務必在事件處理當下用完。
 */
export async function replyWithToken(
  replyToken: string | undefined,
  messages: LineMessage[],
): Promise<boolean> {
  if (!replyToken) return false;
  const clipped = messages.slice(0, 5);
  const result = await lineApi("/message/reply", {
    replyToken,
    messages: clipped,
  });
  return result.ok;
}

/** Push 單人（會消耗訊息額度） */
export async function pushMessages(
  lineUserId: string,
  messages: LineMessage[],
): Promise<boolean> {
  const result = await lineApi("/message/push", {
    to: lineUserId,
    messages: messages.slice(0, 5),
  });
  return result.ok;
}

/**
 * Multicast 多人（最多 500）— 比逐一 push 更省 API call，
 * 但仍會依收件人數計入訊息額度。
 */
export async function multicastMessages(
  lineUserIds: string[],
  messages: LineMessage[],
): Promise<boolean> {
  const unique = [...new Set(lineUserIds.filter(Boolean))];
  if (unique.length === 0) return true;

  // LINE multicast 上限 500
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 500) {
    chunks.push(unique.slice(i, i + 500));
  }

  let allOk = true;
  for (const to of chunks) {
    const result = await lineApi("/message/multicast", {
      to,
      messages: messages.slice(0, 5),
    });
    if (!result.ok) allOk = false;
  }
  return allOk;
}
