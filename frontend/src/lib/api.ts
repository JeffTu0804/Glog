import type {
  Asset,
  CostLog,
  CreateTicketResponse,
  Department,
  GuestRequestItem,
  GuestRoom,
  InventoryItem,
  InventoryUsage,
  LogbookCurrentResponse,
  MaintenanceTicket,
  Reminder,
  ServiceRequest,
  ShiftLogbook,
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

  getTickets: (
    token: string,
    params?: { status?: TicketStatus; assignedToId?: string },
  ) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.assignedToId) search.set("assignedToId", params.assignedToId);
    const query = search.toString() ? `?${search.toString()}` : "";
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
      inventoryUsages?: InventoryUsage[];
      laborCost?: number;
      laborDescription?: string;
    },
  ) =>
    request<{ ticket: MaintenanceTicket }>(
      `/maintenance-tickets/${id}/close`,
      token,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  submitTicketReport: (
    token: string,
    id: string,
    body: {
      type: "COMPLETED" | "NEEDS_FRONT_DESK";
      note: string;
      photos: Array<{ data: string; mimeType: string }>;
    },
  ) =>
    request<{ ticket: MaintenanceTicket }>(
      `/maintenance-tickets/${id}/report`,
      token,
      { method: "POST", body: JSON.stringify(body) },
    ),

  resolveFrontDeskEscalation: (
    token: string,
    id: string,
    body: { action: "RESUME" | "CLOSE"; note: string },
  ) =>
    request<{ ticket: MaintenanceTicket }>(
      `/maintenance-tickets/${id}/front-desk-resolve`,
      token,
      { method: "POST", body: JSON.stringify(body) },
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

  seedStarterAssets: (token: string) =>
    request<{ assets: Asset[]; created: number }>("/assets/seed-starter", token, {
      method: "POST",
    }),

  createInventory: (
    token: string,
    body: { name: string; sku?: string; quantity?: number; unitCost: number },
  ) =>
    request<{ item: InventoryItem }>("/inventory", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getLogbookCurrent: (token: string, department?: Department) => {
    const q = department ? `?department=${department}` : "";
    return request<LogbookCurrentResponse>(`/logbook/current${q}`, token);
  },

  listLogbooks: (token: string, department?: Department) => {
    const q = department ? `?department=${department}` : "";
    return request<{ department: Department; logbooks: ShiftLogbook[] }>(
      `/logbook${q}`,
      token,
    );
  },

  addLogbookEntry: (token: string, logbookId: string, content: string) =>
    request<{ entry: ShiftLogbook["entries"][number] }>(
      `/logbook/${logbookId}/entries`,
      token,
      { method: "POST", body: JSON.stringify({ content }) },
    ),

  publishLogbook: (token: string, logbookId: string) =>
    request<{ logbook: ShiftLogbook }>(`/logbook/${logbookId}/publish`, token, {
      method: "POST",
    }),

  refreshLogbookSummary: (token: string, logbookId: string) =>
    request<{ logbook: ShiftLogbook }>(
      `/logbook/${logbookId}/refresh-summary`,
      token,
      { method: "POST" },
    ),

  getServiceRequests: (token: string, view: "inbox" | "sent" | "all" = "inbox") =>
    request<{ requests: ServiceRequest[] }>(
      `/service-requests?view=${view}`,
      token,
    ),

  createServiceRequest: (
    token: string,
    body: {
      type?: string;
      title: string;
      description?: string;
      guestRoom: string;
      guestName: string;
      targetDepartment: string;
      scheduledAt: string;
      reminderAt?: string;
    },
  ) =>
    request<{ request: ServiceRequest }>("/service-requests", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  confirmServiceRequest: (token: string, id: string, responseNote: string) =>
    request<{ request: ServiceRequest }>(`/service-requests/${id}/confirm`, token, {
      method: "POST",
      body: JSON.stringify({ responseNote }),
    }),

  rejectServiceRequest: (token: string, id: string, responseNote: string) =>
    request<{ request: ServiceRequest }>(`/service-requests/${id}/reject`, token, {
      method: "POST",
      body: JSON.stringify({ responseNote }),
    }),

  getActiveReminders: (token: string) =>
    request<{ reminders: Reminder[] }>("/reminders/active", token),

  dismissReminder: (token: string, id: string) =>
    request<{ reminder: Reminder }>(`/reminders/${id}/dismiss`, token, {
      method: "POST",
    }),

  getGuestRequests: (
    token: string,
    params?: { status?: string; view?: "inbox" | "all" },
  ) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.view) search.set("view", params.view);
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ requests: GuestRequestItem[] }>(`/guest-requests${q}`, token);
  },

  updateGuestRequest: (
    token: string,
    id: string,
    body: { status: "processing" | "completed"; notes?: string },
  ) =>
    request<{ request: GuestRequestItem }>(`/guest-requests/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getGuestRooms: (token: string) =>
    request<{ rooms: GuestRoom[] }>("/guest-requests/rooms", token),

  syncGuestRooms: (token: string) =>
    request<{ created: number; updated: number; rooms: GuestRoom[] }>(
      "/guest-requests/rooms/sync",
      token,
      { method: "POST" },
    ),

  regenerateRoomQr: (token: string, roomId: string) =>
    request<{ room: GuestRoom }>(`/guest-requests/rooms/${roomId}/regenerate-qr`, token, {
      method: "POST",
    }),

  updateHotelLineToken: (token: string, lineOfficialToken: string) =>
    request<{ hotel: { id: string; name: string; lineOfficialToken: string | null } }>(
      "/guest-requests/hotel/line-token",
      token,
      { method: "PATCH", body: JSON.stringify({ lineOfficialToken }) },
    ),
};

export { ApiError };
