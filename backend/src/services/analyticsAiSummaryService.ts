import type { AnalyticsQuery } from "./analyticsService.js";
import { collectExecutiveSummaryContext } from "./analyticsService.js";

export interface ExecutiveSummaryResult {
  executive_summary: string;
  top_3_issues: string[];
  management_advice: string;
  department_optimization?: string;
}

function buildRuleBasedSummary(
  ctx: Awaited<ReturnType<typeof collectExecutiveSummaryContext>>,
): ExecutiveSummaryResult {
  const { overview, sharedLogs, alertReminders, department, departmentLabel } = ctx;
  const topRoom = overview.topProblemRooms[0];
  const topCat = [...overview.categoryBreakdown].sort((a, b) => b.count - a.count)[0];
  const dm = overview.departmentMetrics;

  const issues: string[] = [];

  if (department === "engineering") {
    if (overview.ticketEfficiency.completionRate < 80 && overview.ticketEfficiency.total > 0) {
      issues.push(`工務完工率 ${overview.ticketEfficiency.completionRate}%，派單與備料流程需檢視`);
    }
    if (overview.ticketEfficiency.avgRepairMinutes != null && overview.ticketEfficiency.avgRepairMinutes > 120) {
      issues.push(`平均維修耗時 ${overview.ticketEfficiency.avgRepairMinutes} 分鐘，偏長`);
    }
    if (topRoom) {
      issues.push(`${topRoom.roomNumber} 號房重複報修 ${topRoom.count} 次`);
    }
  } else if (department === "housekeeping") {
    if (dm.lostItemReports > 0) {
      issues.push(`遺失物通報 ${dm.lostItemReports} 則，需加強交班追蹤`);
    }
    if (topRoom) {
      issues.push(`${topRoom.roomNumber} 號房清潔/備品問題 ${topRoom.count} 次`);
    }
    if (overview.ticketEfficiency.total > 0 && overview.ticketEfficiency.completionRate < 85) {
      issues.push(`清房完工率 ${overview.ticketEfficiency.completionRate}%`);
    }
  } else if (department === "front_desk") {
    if (overview.alerts.high > 0) {
      issues.push(`高風險客訴告警 ${overview.alerts.high} 件`);
    }
    if (dm.guestRequestTotal > 0 && dm.guestResolutionRate < 80) {
      issues.push(`住客請求處理率 ${dm.guestResolutionRate}%，Check-in 尖峰可能壅塞`);
    }
    if (sharedLogs.length > 0) {
      issues.push(`跨部門交班事項 ${sharedLogs.length} 則待追蹤`);
    }
  } else if (department === "fb") {
    if (dm.pendingServiceRequests > 0) {
      issues.push(`待確認餐飲預約 ${dm.pendingServiceRequests} 筆`);
    }
    if (dm.serviceRequestTotal > 0 && dm.serviceRequestCompletionRate < 80) {
      issues.push(`預約確認率 ${dm.serviceRequestCompletionRate}%`);
    }
  } else {
    if (topRoom) {
      issues.push(`${topRoom.roomNumber} 號房本期 ${topRoom.count} 次問題，需列為重點關注`);
    }
    if (overview.alerts.high > 0) {
      issues.push(`高風險客訴/逾時告警 ${overview.alerts.high} 件`);
    }
    if (overview.ticketEfficiency.completionRate < 80 && overview.ticketEfficiency.total > 0) {
      issues.push(`工單完工率 ${overview.ticketEfficiency.completionRate}%，低於理想水準`);
    }
    if (sharedLogs.length > 0 && issues.length < 3) {
      issues.push(`跨部門交班同步訊息 ${sharedLogs.length} 則，需接班追蹤`);
    }
  }

  while (issues.length < 3) {
    issues.push("本期無其他重大異常，維持例行巡檢");
    if (issues.filter((i) => i.includes("例行")).length > 1) break;
  }

  const base: ExecutiveSummaryResult = {
    executive_summary:
      department === "all"
        ? `本期共 ${overview.ticketEfficiency.total} 件工單，完工率 ${overview.ticketEfficiency.completionRate}%${
            overview.ticketEfficiency.avgRepairMinutes != null
              ? `，平均維修耗時約 ${overview.ticketEfficiency.avgRepairMinutes} 分鐘`
              : ""
          }。主要問題類型為「${topCat?.category ?? "維修"}」，告警合計 ${overview.alerts.total} 件，跨部門日誌 ${overview.sharedDepartmentLogs} 則。`
        : `【${departmentLabel}】本期核心指標：${overview.kpiCards.map((k) => `${k.label} ${k.value}`).join("、")}。`,
    top_3_issues: issues.slice(0, 3),
    management_advice:
      department === "all"
        ? topRoom && topRoom.count >= 3
          ? `建議對 ${topRoom.roomNumber} 號房安排工程與房務聯合排查，並檢視 SOP 是否需更新。`
          : "建議維持現有派單節奏，持續追蹤高風險告警與跨部門交班事項。"
        : "請依部門專屬改善方針調整下一班排程與 SOP。",
  };

  if (department !== "all") {
    base.department_optimization =
      department === "engineering"
        ? "建議盤點高頻故障房型備品，縮短派工到場時間，並針對逾時工單設自動升級。"
        : department === "housekeeping"
          ? "建議優化退房尖峰清房動線，遺失物建立標準登記與交班模板。"
          : department === "front_desk"
            ? "建議在 Check-in 尖峰預先分流住客請求，客訴告警 15 分鐘內必須回覆。"
            : "建議餐飲預約與前台同步確認機制，縮短待處理預約的滯留時間。";
  }

  return base;
}

function buildSystemPrompt(department: string, departmentLabel: string): string {
  if (department === "all") {
    return `你是專業飯店營運顧問，為總經理撰寫極簡營運簡報。只輸出 JSON：
{
  "executive_summary": "3-5句大局觀（繁體中文）",
  "top_3_issues": ["核心問題1","核心問題2","核心問題3"],
  "management_advice": "下一階段全館營運優化建議（1-3句）"
}
語氣專業、數據導向，避免空泛廢話。`;
  }

  return `你是專業的「${departmentLabel}」營運顧問，為該部門主管撰寫深度營運簡報（非總經理視角）。
針對該部門瓶頸（如工務修繕太慢、前台 Check-in 客訴集中、房務清房延遲、餐飲預約壅塞）給出具體建議。
只輸出 JSON：
{
  "executive_summary": "3-5句該部門營運現況（繁體中文）",
  "top_3_issues": ["部門核心問題1","部門核心問題2","部門核心問題3"],
  "management_advice": "給部門主管的執行建議（1-2句）",
  "department_optimization": "部門優化策略（2-4句，具體可執行）"
}
語氣專業、數據導向，聚焦該部門 SOP 與人力調度。`;
}

export async function generateExecutiveSummary(
  query: AnalyticsQuery,
): Promise<ExecutiveSummaryResult> {
  const ctx = await collectExecutiveSummaryContext(query);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const fallback = buildRuleBasedSummary(ctx);

  if (!apiKey) {
    return fallback;
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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(ctx.department, ctx.departmentLabel),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                department: ctx.departmentLabel,
                period: ctx.overview.periodLabel,
                stats: ctx.overview,
                shared_department_logs: ctx.sharedLogs.slice(0, 30),
                department_logs: ctx.departmentLogs.slice(0, 30),
                high_urgency_logs: ctx.highUrgencyLogs.slice(0, 20),
                customer_alerts: ctx.alertReminders.slice(0, 20),
              },
              null,
              2,
            ),
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(content) as ExecutiveSummaryResult;
    return {
      executive_summary:
        parsed.executive_summary?.trim() || fallback.executive_summary,
      top_3_issues: Array.isArray(parsed.top_3_issues)
        ? parsed.top_3_issues.slice(0, 3)
        : fallback.top_3_issues,
      management_advice:
        parsed.management_advice?.trim() || fallback.management_advice,
      department_optimization:
        ctx.department !== "all"
          ? parsed.department_optimization?.trim() || fallback.department_optimization
          : undefined,
    };
  } catch (err) {
    console.error("[Analytics AI] 摘要產生失敗，使用規則降級", err);
    return fallback;
  }
}
