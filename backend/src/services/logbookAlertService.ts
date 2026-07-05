import { AssetType, Department, TicketPriority } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { createTicket } from "./maintenanceTicketService.js";

const ROOM_CODE_PATTERN = /(?:^|\s|第)(\d{3,4})(?:\s*[號房]|房)?/;

interface MaintenancePattern {
  pattern: RegExp;
  title: string;
  skills: string[];
  priority: TicketPriority;
}

const MAINTENANCE_PATTERNS: MaintenancePattern[] = [
  {
    pattern: /冷氣|空調|不冷|太冷|暖氣|AC/i,
    title: "空調異常",
    skills: ["hvac"],
    priority: TicketPriority.HIGH,
  },
  {
    pattern: /漏水|滴水|滲水|水管/i,
    title: "漏水問題",
    skills: ["plumbing"],
    priority: TicketPriority.URGENT,
  },
  {
    pattern: /熱水|沒熱水|水溫/i,
    title: "熱水異常",
    skills: ["plumbing"],
    priority: TicketPriority.HIGH,
  },
  {
    pattern: /馬桶|洗手台|浴缸|淋浴|排水|堵塞/i,
    title: "衛浴設備異常",
    skills: ["plumbing"],
    priority: TicketPriority.MEDIUM,
  },
  {
    pattern: /跳電|插座|燈不亮|電燈|電力|停電/i,
    title: "電力問題",
    skills: ["electrical"],
    priority: TicketPriority.HIGH,
  },
  {
    pattern: /電視|WiFi|WIFI|網路|網絡|電話/i,
    title: "客房設備報修",
    skills: ["general"],
    priority: TicketPriority.MEDIUM,
  },
  {
    pattern: /異味|霉味|菸味|噪音|異音/i,
    title: "客房環境問題",
    skills: ["general"],
    priority: TicketPriority.MEDIUM,
  },
];

export function parseMaintenanceIssueFromLog(content: string): {
  roomCode: string;
  title: string;
  description: string;
  requiredSkills: string[];
  priority: TicketPriority;
} | null {
  const trimmed = content.trim();
  const roomMatch = trimmed.match(ROOM_CODE_PATTERN);
  if (!roomMatch) return null;

  const matchedPattern = MAINTENANCE_PATTERNS.find((item) => item.pattern.test(trimmed));
  if (!matchedPattern) return null;

  const roomCode = roomMatch[1];
  if (!roomCode) return null;

  return {
    roomCode,
    title: `${roomCode} ${matchedPattern.title}`,
    description: trimmed,
    requiredSkills: matchedPattern.skills,
    priority: matchedPattern.priority,
  };
}

export interface LogbookTicketAlertResult {
  ticketId: string;
  ticketTitle: string;
  assetCode: string;
  autoDispatched: boolean;
  message: string;
}

/** 前台交班日誌備註若含房號 + 維修關鍵字，自動建立工程工單 */
export async function tryCreateTicketFromLogbookEntry(
  tenantId: string,
  userId: string,
  logbookDepartment: Department,
  content: string,
): Promise<LogbookTicketAlertResult | null> {
  if (logbookDepartment !== Department.FRONT_DESK) {
    return null;
  }

  const parsed = parseMaintenanceIssueFromLog(content);
  if (!parsed) return null;

  const asset = await prisma.asset.findFirst({
    where: withTenantScope(tenantId, {
      code: parsed.roomCode,
      type: AssetType.ROOM,
    }),
  });

  if (!asset) {
    return null;
  }

  const result = await createTicket(tenantId, userId, {
    assetId: asset.id,
    title: parsed.title,
    description: parsed.description,
    priority: parsed.priority,
    requiredSkills: parsed.requiredSkills,
  });

  return {
    ticketId: result.ticket.id,
    ticketTitle: result.ticket.title,
    assetCode: asset.code,
    autoDispatched: result.autoDispatched,
    message: result.autoDispatched
      ? `已自動建立工單並派給工程部：${result.ticket.title}`
      : `已自動建立工單並通知工程部：${result.ticket.title}`,
  };
}
