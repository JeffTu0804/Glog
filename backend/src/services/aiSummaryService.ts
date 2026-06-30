import type { ShiftSnapshot } from "./logbookCollectorService.js";

export interface AiSummaryResult {
  aiSummary: string;
  highlights: string[];
  openItems: string[];
}

export async function generateAiSummary(
  snapshot: ShiftSnapshot,
): Promise<AiSummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (apiKey) {
    try {
      return await generateWithOpenAI(snapshot, apiKey);
    } catch {
      // 降級為規則摘要
    }
  }

  return generateRuleBasedSummary(snapshot);
}

async function generateWithOpenAI(
  snapshot: ShiftSnapshot,
  apiKey: string,
): Promise<AiSummaryResult> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是飯店後勤交班助理。根據班別事件資料，用繁體中文產生給接班同仁看的交班摘要。
回傳 JSON：{ "summary": "2-4段完整摘要", "highlights": ["重點1",...], "openItems": ["待追蹤1",...] }
語氣專業簡潔，優先標示緊急工單、故障地點、庫存不足與手動備註。`,
        },
        {
          role: "user",
          content: JSON.stringify(snapshot, null, 2),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");

  const parsed = JSON.parse(content) as {
    summary?: string;
    highlights?: string[];
    openItems?: string[];
  };

  return {
    aiSummary: parsed.summary?.trim() || generateRuleBasedSummary(snapshot).aiSummary,
    highlights: parsed.highlights ?? [],
    openItems: parsed.openItems ?? [],
  };
}

function generateRuleBasedSummary(snapshot: ShiftSnapshot): AiSummaryResult {
  const { shift, tickets, locations, inventory, costs, manualNotes } = snapshot;
  const highlights: string[] = [];
  const openItems: string[] = [];

  if (tickets.created.length > 0) {
    highlights.push(`本班新增 ${tickets.created.length} 筆工單`);
  }

  const urgent = tickets.stillOpen.filter((t) => t.priority === "緊急" || t.priority === "高");
  if (urgent.length > 0) {
    highlights.push(`尚有 ${urgent.length} 筆高優先級工單待處理`);
    for (const t of urgent.slice(0, 5)) {
      openItems.push(`[${t.priority}] ${t.asset}：${t.title}（${t.status}）`);
    }
  }

  if (locations.outOfOrder.length > 0) {
    highlights.push(`${locations.outOfOrder.length} 個地點故障停用`);
    openItems.push(...locations.outOfOrder.map((l) => `故障地點：${l}`));
  }

  if (locations.maintenance.length > 0) {
    highlights.push(`${locations.maintenance.length} 個地點維護中`);
  }

  if (inventory.lowStock.length > 0) {
    highlights.push(`${inventory.lowStock.length} 項耗材低於安全庫存`);
    for (const item of inventory.lowStock.slice(0, 5)) {
      openItems.push(`庫存不足：${item.name}（剩 ${item.quantity}）`);
    }
  }

  if (costs.totalAmount > 0) {
    highlights.push(`本班維護成本 NT$ ${costs.totalAmount.toLocaleString()}`);
  }

  if (manualNotes.length > 0) {
    highlights.push(`${manualNotes.length} 則手動備註`);
  }

  const lines: string[] = [
    `【${shift.label}交班摘要】`,
    "",
    tickets.created.length > 0
      ? `本班共建立 ${tickets.created.length} 筆工單。`
      : "本班無新增工單。",
  ];

  if (tickets.created.length > 0) {
    lines.push("新增工單：");
    for (const t of tickets.created.slice(0, 8)) {
      lines.push(`• ${t.asset}｜${t.title}（${t.priority}，${t.status}，${t.by}）`);
    }
  }

  if (tickets.updated.length > 0) {
    lines.push("", `另有 ${tickets.updated.length} 筆既有工單狀態更新。`);
  }

  if (manualNotes.length > 0) {
    lines.push("", "手動備註：");
    for (const n of manualNotes) {
      lines.push(`• ${n.author}：${n.content}`);
    }
  }

  if (openItems.length === 0 && tickets.stillOpen.length > 0) {
    for (const t of tickets.stillOpen.slice(0, 5)) {
      openItems.push(`${t.asset}：${t.title}（${t.status}）`);
    }
  }

  if (highlights.length === 0) {
    highlights.push("本班營運平穩，無重大異常");
  }

  return {
    aiSummary: lines.join("\n"),
    highlights,
    openItems,
  };
}
