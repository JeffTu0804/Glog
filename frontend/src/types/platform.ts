export type SubscriptionPlan = "TRIAL" | "STARTER" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus =
  | "ACTIVE"
  | "TRIAL"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELLED";

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
}

export interface ManagerAccessRequest {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  managerAccessStatus: string;
  managerRequestedAt: string | null;
  managerReviewedAt?: string | null;
}

export interface TenantStats {
  userCount: number;
  assetCount: number;
  ticketCount: number;
  openTicketCount: number;
  totalCost: string;
  costLogCount: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  createdAt: string;
  stats?: TenantStats;
}

export interface PlatformOverview {
  tenantCount: number;
  activeTenants: number;
  totalTickets: number;
  openTickets: number;
  totalUsers: number;
  totalPlatformCost: string;
}

export interface PlatformTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  asset: { id: string; name: string; code: string };
  triggeredBy: { id: string; name: string; email: string };
  assignedTo: { id: string; name: string; email: string } | null;
}

export interface PlatformCostLog {
  id: string;
  description: string;
  amount: string;
  category: string | null;
  recordedAt: string;
  tenant?: TenantBrief;
  ticket: {
    id: string;
    title: string;
    asset: { code: string; name: string };
  } | null;
}

export interface PlatformInventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  unit: string;
  unitCost: string;
  reorderLevel: number;
  tenant?: TenantBrief;
}

export interface PlatformTenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  status: string;
  accountStatus: string;
  positionLevel: string;
  createdAt: string;
  tenant?: TenantBrief;
}

export interface TenantBrief {
  id: string;
  name: string;
  slug: string;
}

export type AnalyticsPeriod = "daily" | "weekly" | "monthly";

export type AnalyticsDepartment =
  | "all"
  | "front_desk"
  | "housekeeping"
  | "engineering"
  | "fb";

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

export interface PlatformAnalytics {
  period: AnalyticsPeriod;
  periodLabel: string;
  department: AnalyticsDepartment;
  departmentLabel: string;
  range: { start: string; end: string };
  kpiCards: AnalyticsKpiCard[];
  charts: AnalyticsChartConfig;
  ticketEfficiency: {
    total: number;
    completed: number;
    completionRate: number;
    avgRepairMinutes: number | null;
  };
  categoryBreakdown: { category: string; count: number }[];
  topProblemRooms: { roomNumber: string; count: number }[];
  ticketTrend: { date: string; created: number; completed: number }[];
  alerts: {
    high: number;
    medium: number;
    total: number;
    trend: { date: string; high: number; medium: number }[];
  };
  sharedDepartmentLogs: number;
  departmentMetrics: {
    guestRequestTotal: number;
    guestResolutionRate: number;
    serviceRequestTotal: number;
    serviceRequestCompletionRate: number;
    pendingServiceRequests: number;
    avgServiceHandleMinutes: number | null;
    departmentLogCount: number;
    lostItemReports: number;
  };
}

export interface ExecutiveSummary {
  executive_summary: string;
  top_3_issues: string[];
  management_advice: string;
  department_optimization?: string;
}
