function getMessagingAccessToken(): string {
  const token =
    process.env.LINE_MESSAGING_ACCESS_TOKEN?.trim() ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error("未設定 LINE_MESSAGING_ACCESS_TOKEN");
  }

  return token;
}

/** 下載 LINE 訊息內容（音訊、圖片等） */
export async function downloadLineMessageContent(messageId: string): Promise<Buffer> {
  const token = getMessagingAccessToken();
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE Content API 失敗 (${res.status}): ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
