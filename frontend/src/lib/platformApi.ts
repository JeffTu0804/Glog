import type {
  ManagerAccessRequest,
  PlatformAdmin,
  PlatformCostLog,
  PlatformInventoryItem,
  PlatformOverview,
  PlatformTenantUser,
  PlatformTicket,
  SubscriptionPlan,
  SubscriptionStatus,
  Tenant,
} from "../types/platform";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/platform/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = (await res.json()) as T & { error?: string };

  if (!res.ok) {
    throw new ApiError(data.error ?? "請求失敗");
  }

  return data;
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/platform/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = (await res.json()) as T & { error?: string };

  if (!res.ok) {
    throw new ApiError(data.error ?? "請求失敗");
  }

  return data;
}

export const platformApi = {
  requestManagerAccessAfterSignup: (body: {
    supabaseUserId: string;
    email: string;
    name?: string;
  }) =>
    publicRequest<{ status: string; message: string }>("/access-requests/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMyAccessRequest: (token: string) =>
    request<{ request: ManagerAccessRequest | null }>("/access-requests/me", token),

  requestManagerAccess: (token: string, body?: { name?: string }) =>
    request<{ status: string; message: string }>("/access-requests", token, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  getAccessRequests: (token: string) =>
    request<{ requests: ManagerAccessRequest[] }>("/access-requests", token),

  reviewAccessRequest: (
    token: string,
    id: string,
    decision: "approve" | "reject",
  ) =>
    request<{ request: ManagerAccessRequest }>(`/access-requests/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    }),

  getMe: (token: string) =>
    request<{ admin: PlatformAdmin }>("/me", token),

  getStats: (token: string) =>
    request<{ stats: PlatformOverview }>("/stats", token),

  getTenants: (
    token: string,
    params?: {
      status?: SubscriptionStatus;
      plan?: SubscriptionPlan;
      search?: string;
    },
  ) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.plan) search.set("plan", params.plan);
    if (params?.search) search.set("search", params.search);
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ tenants: Tenant[] }>(`/tenants${q}`, token);
  },

  getTenant: (token: string, id: string) =>
    request<{ tenant: Tenant }>(`/tenants/${id}`, token),

  getTenantTickets: (token: string, id: string, status?: string) => {
    const q = status ? `?status=${status}` : "";
    return request<{ tickets: PlatformTicket[] }>(
      `/tenants/${id}/tickets${q}`,
      token,
    );
  },

  getTenantCostLogs: (token: string, id: string) =>
    request<{ costLogs: PlatformCostLog[] }>(`/tenants/${id}/cost-logs`, token),

  getTenantUsers: (token: string, id: string) =>
    request<{ users: PlatformTenantUser[] }>(`/tenants/${id}/users`, token),

  getTenantInventory: (token: string, id: string) =>
    request<{ items: PlatformInventoryItem[] }>(`/tenants/${id}/inventory`, token),

  updateSubscription: (
    token: string,
    id: string,
    body: {
      plan?: SubscriptionPlan;
      subscriptionStatus?: SubscriptionStatus;
      contactEmail?: string;
    },
  ) =>
    request<{ tenant: Tenant }>(`/tenants/${id}/subscription`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getInventory: (
    token: string,
    params?: { tenantId?: string; lowStock?: boolean },
  ) => {
    const search = new URLSearchParams();
    if (params?.tenantId) search.set("tenantId", params.tenantId);
    if (params?.lowStock) search.set("lowStock", "true");
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ items: PlatformInventoryItem[] }>(`/inventory${q}`, token);
  },

  getCostLogs: (token: string, params?: { tenantId?: string }) => {
    const search = new URLSearchParams();
    if (params?.tenantId) search.set("tenantId", params.tenantId);
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ costLogs: PlatformCostLog[] }>(`/cost-logs${q}`, token);
  },

  getUsers: (token: string, params?: { tenantId?: string }) => {
    const search = new URLSearchParams();
    if (params?.tenantId) search.set("tenantId", params.tenantId);
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ users: PlatformTenantUser[] }>(`/users${q}`, token);
  },
};

export { ApiError as PlatformApiError };
