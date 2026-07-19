import type {
  Asset,
  CostLog,
  CreateTicketResponse,
  Department,
  GuestRequestItem,
  GuestRoom,
  HandoverAckItem,
  HandoverItemType,
  HomeResponse,
  InventoryItem,
  InventoryUsage,
  LogbookCurrentResponse,
  MaintenanceTicket,
  Reminder,
  RoutingDecision,
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

  previewLogbookRouting: (token: string, content: string, department?: Department) => {
    const q = department ? `?department=${department}` : "";
    return request<{ routing_decision: RoutingDecision }>(
      `/logbook/preview-routing${q}`,
      token,
      { method: "POST", body: JSON.stringify({ content }) },
    );
  },

  addLogbookEntry: (
    token: string,
    logbookId: string,
    content: string,
    routing_decision?: RoutingDecision,
  ) =>
    request<{
      entry?: ShiftLogbook["entries"][number];
      entries?: ShiftLogbook["entries"];
      routedDepartments?: Department[];
      ticketAlert?: {
        ticketId: string;
        ticketTitle: string;
        assetCode: string;
        autoDispatched: boolean;
        message: string;
      } | null;
    }>(
      `/logbook/${logbookId}/entries`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ content, routing_decision }),
      },
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

  getServiceRequests: (
    token: string,
    view: "inbox" | "sent" | "all" | "active" = "inbox",
    department?: string,
  ) => {
    const params = new URLSearchParams({ view });
    if (department) params.set("department", department);
    return request<{ requests: ServiceRequest[] }>(
      `/service-requests?${params.toString()}`,
      token,
    );
  },

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

  confirmServiceRequest: (token: string, id: string, responseNote?: string) =>
    request<{ request: ServiceRequest }>(`/service-requests/${id}/confirm`, token, {
      method: "POST",
      body: JSON.stringify({ responseNote: responseNote ?? "" }),
    }),

  rejectServiceRequest: (token: string, id: string, responseNote: string) =>
    request<{ request: ServiceRequest }>(`/service-requests/${id}/reject`, token, {
      method: "POST",
      body: JSON.stringify({ responseNote }),
    }),

  acceptServiceRequest: (token: string, id: string) =>
    request<{ request: ServiceRequest; message: string }>(
      `/service-requests/${id}/accept`,
      token,
      { method: "POST" },
    ),

  completeServiceRequest: (
    token: string,
    id: string,
    body: { note?: string; photo?: { data: string; mimeType: string } | null },
  ) =>
    request<{ request: ServiceRequest; message: string }>(
      `/service-requests/${id}/complete`,
      token,
      { method: "POST", body: JSON.stringify(body) },
    ),

  acceptMaintenanceTicket: (token: string, id: string) =>
    request<{ ticket: MaintenanceTicket; message: string }>(
      `/maintenance-tickets/${id}/accept`,
      token,
      { method: "POST" },
    ),

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

  getHome: (token: string) => request<HomeResponse>("/home", token),

  toggleHandoverAck: (
    token: string,
    body: {
      logbookId: string;
      itemType: HandoverItemType;
      itemIndex: number;
      completed: boolean;
    },
  ) =>
    request<{ handoverAcks: HandoverAckItem[] }>("/home/handover-ack", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

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

  getCrossDeptTickets: (
    token: string,
    params?: {
      hotelId?: string;
      status?: "all" | "pending" | "in_progress" | "processing" | "completed" | "delayed" | "active";
      department?: string;
      q?: string;
    } | string,
  ) => {
    // 相容舊呼叫：getCrossDeptTickets(token, hotelIdString)
    const opts =
      typeof params === "string" ? { hotelId: params } : (params ?? {});
    const search = new URLSearchParams();
    if (opts.hotelId) search.set("hotelId", opts.hotelId);
    if (opts.status) search.set("status", opts.status);
    if (opts.department) search.set("department", opts.department);
    if (opts.q) search.set("q", opts.q);
    const query = search.toString() ? `?${search.toString()}` : "";
    return request<{
      hotelId: string;
      tickets: Array<{
        id: string;
        hotelId: string;
        caseNumber?: string | null;
        fromDepartment: string;
        toDepartment: string;
        createdByEmployeeId: string;
        handledByEmployeeId: string | null;
        description: string;
        status: string;
        delayReason: string | null;
        createdAt: string;
        updatedAt: string;
        createdBy?: { id: string; name: string; department: string };
        handledBy?: { id: string; name: string; department: string } | null;
      }>;
    }>(`/cross-dept/tickets${query}`, token);
  },

  createCrossDeptTicket: (
    token: string,
    body: { toDepartment: string; description: string; lineUserId?: string },
  ) =>
    request<{ ticketId: string; pushedTo: number }>("/cross-dept/tickets", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getActiveMemos: (token: string) =>
    request<{ memos: import("../types/api").HotelNotice[] }>(
      "/notices/active-memos",
      token,
    ),

  getNotices: (
    token: string,
    params?: { type?: "TASK" | "MEMO"; activeOnly?: boolean },
  ) => {
    const search = new URLSearchParams();
    if (params?.type) search.set("type", params.type);
    if (params?.activeOnly) search.set("activeOnly", "1");
    const q = search.toString() ? `?${search.toString()}` : "";
    return request<{ notices: import("../types/api").HotelNotice[] }>(
      `/notices${q}`,
      token,
    );
  },

  createNotice: (
    token: string,
    body: {
      type: "TASK" | "MEMO";
      title: string;
      content?: string;
      expiresAt?: string | null;
      targetDepartment?: string;
      guestRoom?: string;
    },
  ) =>
    request<{ notice: import("../types/api").HotelNotice }>("/notices", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  markNoticeRead: (token: string, id: string) =>
    request<{ notice: import("../types/api").HotelNotice }>(
      `/notices/${id}/read`,
      token,
      { method: "POST" },
    ),

  getChatThreads: (token: string) =>
    request<{
      hotelName: string;
      threads: Array<{
        staff: {
          id: string;
          name: string;
          role: UserRole;
          status: "IDLE" | "BUSY";
          lineUserId: string | null;
        };
        lastMessage: {
          content: string;
          createdAt: string;
          sender: string;
          ticketId: string | null;
        } | null;
        unreadCount: number;
      }>;
    }>("/chat/threads", token),

  getChatMessages: (token: string, staffUserId: string) =>
    request<{
      messages: Array<{
        id: string;
        sender: "staff" | "manager" | "system";
        messageType: string;
        content: string;
        ticketId: string | null;
        ticketKind: string | null;
        createdAt: string;
      }>;
    }>(`/chat/threads/${staffUserId}/messages`, token),

  getChatTickets: (token: string, staffUserId: string) =>
    request<{
      tickets: Array<{
        id: string;
        kind: string;
        title: string;
        description: string | null;
        guestRoom: string;
        status: "PENDING" | "IN_PROGRESS";
        urgency: string;
        acceptedAt: string | null;
        createdAt: string;
        department: Department;
        createdByName: string;
      }>;
    }>(`/chat/threads/${staffUserId}/tickets`, token),

  sendChatMessage: (
    token: string,
    staffUserId: string,
    body: { content: string; ticketId?: string; ticketKind?: string },
  ) =>
    request<{ ok: boolean }>(`/chat/threads/${staffUserId}/messages`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export { ApiError };
