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
  ticket: {
    id: string;
    title: string;
    asset: { code: string; name: string };
  } | null;
}

export interface PlatformTenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  skills: string[];
  createdAt: string;
}
