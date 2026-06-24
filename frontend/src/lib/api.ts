import type {
  Asset,
  CostLog,
  CreateTicketResponse,
  InventoryItem,
  InventoryUsage,
  MaintenanceTicket,
  TicketPriority,
  TicketStatus,
  User,
  UserRole,
} from "../types/api";

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
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
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

export const api = {
  getMe: (token: string) => request<{ user: User }>("/me", token),

  getTickets: (token: string, params?: { status?: TicketStatus }) => {
    const query = params?.status ? `?status=${params.status}` : "";
    return request<{ tickets: MaintenanceTicket[] }>(
      `/maintenance-tickets${query}`,
      token,
    );
  },

  getTicket: (token: string, id: string) =>
    request<{ ticket: MaintenanceTicket }>(`/maintenance-tickets/${id}`, token),

  createTicket: (
    token: string,
    body: {
      assetId: string;
      title: string;
      description?: string;
      priority?: TicketPriority;
      requiredSkills?: string[];
    },
  ) =>
    request<CreateTicketResponse>("/maintenance-tickets", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assignTicket: (token: string, id: string, assignedToId: string) =>
    request<{ ticket: MaintenanceTicket }>(
      `/maintenance-tickets/${id}/assign`,
      token,
      { method: "PATCH", body: JSON.stringify({ assignedToId }) },
    ),

  updateTicketStatus: (token: string, id: string, status: TicketStatus) =>
    request<{ ticket: MaintenanceTicket }>(
      `/maintenance-tickets/${id}/status`,
      token,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),

  closeTicket: (
    token: string,
    id: string,
    body: {
      inventoryUsages: InventoryUsage[];
      laborCost?: number;
      laborDescription?: string;
    },
  ) =>
    request<{ ticket: MaintenanceTicket }>(
      `/maintenance-tickets/${id}/close`,
      token,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  getAssets: (token: string) =>
    request<{ assets: Asset[] }>("/assets", token),

  getUsers: (token: string, params?: { role?: UserRole; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.role) search.set("role", params.role);
    if (params?.status) search.set("status", params.status);
    const query = search.toString() ? `?${search.toString()}` : "";
    return request<{ users: User[] }>(`/users${query}`, token);
  },

  getInventory: (token: string, params?: { lowStock?: boolean }) => {
    const q = params?.lowStock ? "?lowStock=true" : "";
    return request<{ items: InventoryItem[] }>(`/inventory${q}`, token);
  },

  getCostLogs: (token: string, params?: { ticketId?: string; category?: string }) => {
    const search = new URLSearchParams();
    if (params?.ticketId) search.set("ticketId", params.ticketId);
    if (params?.category) search.set("category", params.category);
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ costLogs: CostLog[] }>(`/cost-logs${q}`, token);
  },

  createAsset: (
    token: string,
    body: { name: string; code: string; type: string; location?: string },
  ) =>
    request<{ asset: Asset }>("/assets", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createInventory: (
    token: string,
    body: { name: string; sku?: string; quantity?: number; unitCost: number },
  ) =>
    request<{ item: InventoryItem }>("/inventory", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export { ApiError };
