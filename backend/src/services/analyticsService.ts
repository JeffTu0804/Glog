import {
  Department,
  LogEntryVisibility,
  LogEntryUrgency,
  Prisma,
  ServiceRequestStatus,
  TicketStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  parseAnalyticsDepartment,
  analyticsDepartmentToPrisma,
  ANALYTICS_DEPARTMENT_LABELS,
  type AnalyticsDepartmentSlug,
} from "../utils/analyticsDepartment.js";
import {
  parseAnalyticsPeriod,
  resolveAnalyticsPeriod,
  toTaipeiDateKey,
  type AnalyticsPeriod,
} from "../utils/analyticsPeriod.js";

export type WorkCategory = "維修" | "清潔" | "客務";

const COMPLETED_STATUSES: TicketStatus[] = [
  TicketStatus.COMPLETED,
  TicketStatus.CLOSED,
];

const SR_DONE: ServiceRequestStatus[] = [
  ServiceRequestStatus.CONFIRMED,
  ServiceRequestStatus.COMPLETED,
];

export function inferWorkCategory(
  title: string,
  description?: string | null,
): WorkCategory {
  const text = `${title} ${description ?? ""}`;
  if (/清潔|房務|枕頭|毛巾|備品|打掃/.test(text)) return "清潔";
  if (/客訴|客人|客務|VIP|投訴|服務請求/.test(text)) return "客務";
  return "維修";
}

function isHousekeepingTicket(title: string, description?: string | null): boolean {
  return title.includes("[房務]") || inferWorkCategory(title, description) === "清潔";
}

function parseAlertLevel(title: string): "high" | "medium" | null {
  if (title.includes("客訴警示")) {
    if (title.includes("高")) return "high";
    if (title.includes("中")) return "medium";
  }
  if (title.includes("逾時") || title.includes("升級")) return "high";
  return null;
}

function avgMinutes(
  rows: Array<{ start: Date; end: Date | null }>,
): number | null {
  const valid = rows.filter((r) => r.end);
  if (valid.length === 0) return null;
  const totalMs = valid.reduce(
    (sum, r) => sum + (r.end!.getTime() - r.start.getTime()),
    0,
  );
  return Math.round(totalMs / valid.length / 60000);
}

function completionRate(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
}

export interface AnalyticsQuery {
  period?: AnalyticsPeriod;
  tenantId?: string;
  department?: AnalyticsDepartmentSlug;
}

export interface AnalyticsKpiCard {
  id: string;
  label: string;
  value: string;
}

export interface AnalyticsChartConfig {
  ticketTrend: boolean;
  categoryBreakdown: boolean;
  topProblemRooms: boolean;
  alertTrend: boolean;
}

function tenantHotelFilter(tenantId?: string): Prisma.GuestRequestWhereInput {
  return tenantId ? { hotel: { tenantId } } : {};
}

function logEntryDeptFilter(dept: Department): Prisma.ShiftLogEntryWhereInput {
  return {
    OR: [
      { logbook: { department: dept } },
      { sourceDepartment: dept },
      { sharedWith: { has: dept } },
    ],
  };
}

function ticketMatchesDepartment(
  title: string,
  description: string | null | undefined,
  department: AnalyticsDepartmentSlug,
): boolean {
  if (department === "all") return true;
  const hk = isHousekeepingTicket(title, description);
  if (department === "housekeeping") return hk;
  if (department === "engineering") return !hk;
  return false;
}

export async function getAnalyticsOverview(query: AnalyticsQuery) {
  const period = query.period ?? "daily";
  const department = query.department ?? "all";
  const prismaDept = analyticsDepartmentToPrisma(department);
  const { start, end, label } = resolveAnalyticsPeriod(period);
  const tenantFilter = query.tenantId ? { tenantId: query.tenantId } : {};

  const dateRange = { gte: start, lte: end };

  const ticketWhereBase: Prisma.MaintenanceTicketWhereInput = {
    ...tenantFilter,
    triggeredAt: dateRange,
  };

  const srWhereBase: Prisma.ServiceRequestWhereInput = {
    ...tenantFilter,
    createdAt: dateRange,
    ...(prismaDept ? { targetDepartment: prismaDept } : {}),
  };

  const reminderWhereBase: Prisma.ReminderWhereInput = {
    ...tenantFilter,
    createdAt: dateRange,
    ...(prismaDept ? { notifyDepartment: prismaDept } : {}),
  };

  const logWhereBase: Prisma.ShiftLogEntryWhereInput = {
    ...tenantFilter,
    createdAt: dateRange,
    ...(prismaDept ? logEntryDeptFilter(prismaDept) : {}),
  };

  const guestWhereBase: Prisma.GuestRequestWhereInput = {
    ...tenantHotelFilter(query.tenantId),
    createdAt: dateRange,
    ...(prismaDept ? { targetDepartment: prismaDept } : {}),
  };

  const [
    allTickets,
    serviceRequests,
    alertReminders,
    sharedLogCount,
    deptLogCount,
    guestRequests,
    lostItemLogCount,
  ] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where: ticketWhereBase,
      select: {
        title: true,
        description: true,
        triggeredAt: true,
        completedAt: true,
        status: true,
        asset: { select: { code: true } },
      },
      take: 5000,
    }),
    prisma.serviceRequest.findMany({
      where: srWhereBase,
      select: {
        title: true,
        description: true,
        guestRoom: true,
        createdAt: true,
        type: true,
        status: true,
        acceptedAt: true,
        confirmedAt: true,
        rejectedAt: true,
      },
      take: 3000,
    }),
    prisma.reminder.findMany({
      where: {
        ...reminderWhereBase,
        OR: department === "all" || department === "front_desk"
          ? [
              { title: { contains: "客訴警示" } },
              { title: { contains: "逾時" } },
              { title: { contains: "升級" } },
            ]
          : [{ title: { contains: "逾時" } }, { title: { contains: "升級" } }],
      },
      select: { title: true, createdAt: true },
      take: 3000,
    }),
    prisma.shiftLogEntry.count({
      where: {
        ...tenantFilter,
        visibility: LogEntryVisibility.SHARED,
        createdAt: dateRange,
        ...(prismaDept ? logEntryDeptFilter(prismaDept) : {}),
      },
    }),
    prisma.shiftLogEntry.count({
      where: logWhereBase,
    }),
    department === "all" || department === "front_desk" || department === "housekeeping"
      ? prisma.guestRequest.findMany({
          where: guestWhereBase,
          select: {
            requestType: true,
            status: true,
            createdAt: true,
            completedAt: true,
            room: { select: { roomNumber: true } },
          },
          take: 3000,
        })
      : Promise.resolve([]),
    department === "housekeeping"
      ? prisma.shiftLogEntry.count({
          where: {
            ...logWhereBase,
            content: { contains: "遺失" },
          },
        })
      : Promise.resolve(0),
  ]);

  const ticketsForDept = allTickets.filter((t) =>
    ticketMatchesDepartment(t.title, t.description, department),
  );

  const includeTickets =
    department === "all" ||
    department === "engineering" ||
    department === "housekeeping";

  const includeServiceRequests =
    department === "all" ||
    department === "front_desk" ||
    department === "housekeeping" ||
    department === "fb";

  const completedTickets = ticketsForDept.filter(
    (t) => COMPLETED_STATUSES.includes(t.status) && t.completedAt,
  ).length;

  const totalTickets = ticketsForDept.length;
  const avgRepairMinutes = includeTickets
    ? avgMinutes(
        ticketsForDept.map((t) => ({
          start: t.triggeredAt,
          end: t.completedAt,
        })),
      )
    : null;

  const completedGuest = guestRequests.filter(
    (g) => g.status === "completed" || g.completedAt,
  ).length;
  const guestResolutionRate = completionRate(completedGuest, guestRequests.length);

  const completedSr = serviceRequests.filter((sr) =>
    SR_DONE.includes(sr.status),
  ).length;
  const srCompletionRate = completionRate(completedSr, serviceRequests.length);

  const pendingSr = serviceRequests.filter(
    (sr) => sr.status === ServiceRequestStatus.PENDING,
  ).length;

  const avgSrHandleMinutes = avgMinutes(
    serviceRequests
      .filter((sr) => sr.acceptedAt && (sr.confirmedAt || sr.rejectedAt))
      .map((sr) => ({
        start: sr.createdAt,
        end: sr.confirmedAt ?? sr.rejectedAt,
      })),
  );

  const categoryCounts: Record<WorkCategory, number> = {
    維修: 0,
    清潔: 0,
    客務: 0,
  };

  const roomIssueMap = new Map<string, number>();

  if (includeTickets) {
    for (const t of ticketsForDept) {
      const cat = inferWorkCategory(t.title, t.description);
      if (department === "all" || department === "engineering" || department === "housekeeping") {
        categoryCounts[cat] += 1;
      }
      const room = t.asset.code;
      roomIssueMap.set(room, (roomIssueMap.get(room) ?? 0) + 1);
    }
  }

  if (includeServiceRequests) {
    for (const sr of serviceRequests) {
      const cat =
        sr.type === "RESTAURANT_RESERVATION"
          ? "客務"
          : inferWorkCategory(sr.title, sr.description);
      categoryCounts[cat] += 1;
      if (sr.guestRoom && sr.guestRoom !== "—") {
        roomIssueMap.set(sr.guestRoom, (roomIssueMap.get(sr.guestRoom) ?? 0) + 1);
      }
    }
  }

  if (guestRequests.length > 0) {
    for (const g of guestRequests) {
      categoryCounts["客務"] += 1;
      const room = g.room.roomNumber;
      roomIssueMap.set(room, (roomIssueMap.get(room) ?? 0) + 1);
    }
  }

  const topProblemRooms = [...roomIssueMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([roomNumber, count]) => ({ roomNumber, count }));

  const ticketTrendMap = new Map<string, { created: number; completed: number }>();

  if (includeTickets) {
    for (const t of ticketsForDept) {
      const key = toTaipeiDateKey(t.triggeredAt);
      const bucket = ticketTrendMap.get(key) ?? { created: 0, completed: 0 };
      bucket.created += 1;
      if (COMPLETED_STATUSES.includes(t.status)) {
        bucket.completed += 1;
      }
      ticketTrendMap.set(key, bucket);
    }
  }

  const ticketTrend = [...ticketTrendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  let highAlerts = 0;
  let mediumAlerts = 0;
  const alertTrendMap = new Map<string, { high: number; medium: number }>();

  const showAlerts =
    department === "all" || department === "front_desk" || department === "engineering";

  if (showAlerts) {
    for (const r of alertReminders) {
      const level = parseAlertLevel(r.title);
      if (level === "high") highAlerts += 1;
      else if (level === "medium") mediumAlerts += 1;
      else continue;

      const key = toTaipeiDateKey(r.createdAt);
      const bucket = alertTrendMap.get(key) ?? { high: 0, medium: 0 };
      if (level === "high") bucket.high += 1;
      else bucket.medium += 1;
      alertTrendMap.set(key, bucket);
    }
  }

  const alertTrend = [...alertTrendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const kpiCards = buildKpiCards(department, {
    totalTickets,
    completedTickets,
    completionRate: completionRate(completedTickets, totalTickets),
    avgRepairMinutes,
    highAlerts,
    mediumAlerts,
    guestRequests: guestRequests.length,
    guestResolutionRate,
    serviceRequests: serviceRequests.length,
    srCompletionRate,
    pendingSr,
    avgSrHandleMinutes,
    sharedLogCount,
    deptLogCount,
    lostItemLogCount,
  });

  const charts = buildChartConfig(department);

  const categoryBreakdown = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0 || department === "all")
    .map(([category, count]) => ({ category, count }));

  return {
    period,
    periodLabel: label,
    department,
    departmentLabel: ANALYTICS_DEPARTMENT_LABELS[department],
    range: { start: start.toISOString(), end: end.toISOString() },
    kpiCards,
    charts,
    ticketEfficiency: {
      total: totalTickets,
      completed: completedTickets,
      completionRate: completionRate(completedTickets, totalTickets),
      avgRepairMinutes,
    },
    categoryBreakdown,
    topProblemRooms,
    ticketTrend,
    alerts: {
      high: highAlerts,
      medium: mediumAlerts,
      total: highAlerts + mediumAlerts,
      trend: alertTrend,
    },
    sharedDepartmentLogs: sharedLogCount,
    departmentMetrics: {
      guestRequestTotal: guestRequests.length,
      guestResolutionRate,
      serviceRequestTotal: serviceRequests.length,
      serviceRequestCompletionRate: srCompletionRate,
      pendingServiceRequests: pendingSr,
      avgServiceHandleMinutes: avgSrHandleMinutes,
      departmentLogCount: deptLogCount,
      lostItemReports: lostItemLogCount,
    },
  };
}

function buildKpiCards(
  department: AnalyticsDepartmentSlug,
  m: {
    totalTickets: number;
    completedTickets: number;
    completionRate: number;
    avgRepairMinutes: number | null;
    highAlerts: number;
    mediumAlerts: number;
    guestRequests: number;
    guestResolutionRate: number;
    serviceRequests: number;
    srCompletionRate: number;
    pendingSr: number;
    avgSrHandleMinutes: number | null;
    sharedLogCount: number;
    deptLogCount: number;
    lostItemLogCount: number;
  },
): AnalyticsKpiCard[] {
  switch (department) {
    case "engineering":
      return [
        { id: "tickets", label: "維修工單數", value: String(m.totalTickets) },
        { id: "completion", label: "完工率", value: `${m.completionRate}%` },
        {
          id: "avg_repair",
          label: "平均維修耗時",
          value: m.avgRepairMinutes != null ? `${m.avgRepairMinutes} 分` : "—",
        },
        { id: "alerts", label: "高/中風險告警", value: `${m.highAlerts} / ${m.mediumAlerts}` },
      ];
    case "housekeeping":
      return [
        { id: "tickets", label: "清潔工單數", value: String(m.totalTickets) },
        { id: "completion", label: "清房完工率", value: `${m.completionRate}%` },
        {
          id: "avg_clean",
          label: "平均清房時間",
          value: m.avgRepairMinutes != null ? `${m.avgRepairMinutes} 分` : "—",
        },
        { id: "lost", label: "遺失物通報", value: String(m.lostItemLogCount) },
      ];
    case "front_desk":
      return [
        { id: "guest", label: "住客請求數", value: String(m.guestRequests) },
        { id: "resolution", label: "客訴處理率", value: `${m.guestResolutionRate}%` },
        { id: "alerts", label: "高/中風險告警", value: `${m.highAlerts} / ${m.mediumAlerts}` },
        { id: "shared_logs", label: "跨部門日誌", value: String(m.sharedLogCount) },
      ];
    case "fb":
      return [
        { id: "sr", label: "餐飲服務請求", value: String(m.serviceRequests) },
        { id: "sr_completion", label: "預約確認率", value: `${m.srCompletionRate}%` },
        { id: "pending", label: "待處理預約", value: String(m.pendingSr) },
        {
          id: "avg_handle",
          label: "平均處理時間",
          value: m.avgSrHandleMinutes != null ? `${m.avgSrHandleMinutes} 分` : "—",
        },
      ];
    default:
      return [
        { id: "tickets", label: "總工單數", value: String(m.totalTickets) },
        { id: "completion", label: "完工率", value: `${m.completionRate}%` },
        {
          id: "avg_repair",
          label: "平均維修耗時",
          value: m.avgRepairMinutes != null ? `${m.avgRepairMinutes} 分` : "—",
        },
        { id: "alerts", label: "高/中風險告警", value: `${m.highAlerts} / ${m.mediumAlerts}` },
      ];
  }
}

function buildChartConfig(department: AnalyticsDepartmentSlug): AnalyticsChartConfig {
  switch (department) {
    case "engineering":
      return {
        ticketTrend: true,
        categoryBreakdown: true,
        topProblemRooms: true,
        alertTrend: true,
      };
    case "housekeeping":
      return {
        ticketTrend: true,
        categoryBreakdown: true,
        topProblemRooms: true,
        alertTrend: false,
      };
    case "front_desk":
      return {
        ticketTrend: false,
        categoryBreakdown: true,
        topProblemRooms: true,
        alertTrend: true,
      };
    case "fb":
      return {
        ticketTrend: false,
        categoryBreakdown: true,
        topProblemRooms: false,
        alertTrend: false,
      };
    default:
      return {
        ticketTrend: true,
        categoryBreakdown: true,
        topProblemRooms: true,
        alertTrend: true,
      };
  }
}

export async function collectExecutiveSummaryContext(query: AnalyticsQuery) {
  const period = query.period ?? "daily";
  const department = query.department ?? "all";
  const prismaDept = analyticsDepartmentToPrisma(department);
  const { start, end } = resolveAnalyticsPeriod(period);
  const tenantFilter = query.tenantId ? { tenantId: query.tenantId } : {};
  const dateRange = { gte: start, lte: end };

  const logWhere: Prisma.ShiftLogEntryWhereInput = {
    ...tenantFilter,
    createdAt: dateRange,
    ...(prismaDept ? logEntryDeptFilter(prismaDept) : {}),
  };

  const [overview, sharedLogs, highUrgencyLogs, alertReminders, deptLogs] =
    await Promise.all([
      getAnalyticsOverview(query),
      prisma.shiftLogEntry.findMany({
        where: {
          ...tenantFilter,
          visibility: LogEntryVisibility.SHARED,
          createdAt: dateRange,
          ...(prismaDept ? logEntryDeptFilter(prismaDept) : {}),
        },
        select: {
          content: true,
          routingReason: true,
          urgency: true,
          sourceDepartment: true,
          createdAt: true,
          logbook: { select: { department: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      prisma.shiftLogEntry.findMany({
        where: {
          ...logWhere,
          urgency: { in: [LogEntryUrgency.HIGH, LogEntryUrgency.MEDIUM] },
        },
        select: {
          content: true,
          urgency: true,
          visibility: true,
          createdAt: true,
          logbook: { select: { department: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.reminder.findMany({
        where: {
          ...tenantFilter,
          createdAt: dateRange,
          ...(prismaDept ? { notifyDepartment: prismaDept } : {}),
          OR: [
            { title: { contains: "客訴警示" } },
            { title: { contains: "逾時" } },
          ],
        },
        select: { title: true, message: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.shiftLogEntry.findMany({
        where: logWhere,
        select: {
          content: true,
          urgency: true,
          createdAt: true,
          logbook: { select: { department: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  return {
    department,
    departmentLabel: ANALYTICS_DEPARTMENT_LABELS[department],
    overview,
    sharedLogs: sharedLogs.map((e) => ({
      department: e.logbook.department,
      sourceDepartment: e.sourceDepartment,
      content: e.content,
      reason: e.routingReason,
      urgency: e.urgency,
      at: e.createdAt.toISOString(),
    })),
    highUrgencyLogs: highUrgencyLogs.map((e) => ({
      department: e.logbook.department,
      content: e.content,
      urgency: e.urgency,
      visibility: e.visibility,
      at: e.createdAt.toISOString(),
    })),
    alertReminders: alertReminders.map((r) => ({
      title: r.title,
      message: r.message,
      at: r.createdAt.toISOString(),
    })),
    departmentLogs: deptLogs.map((e) => ({
      department: e.logbook.department,
      content: e.content,
      urgency: e.urgency,
      at: e.createdAt.toISOString(),
    })),
  };
}

export { parseAnalyticsPeriod, parseAnalyticsDepartment };
