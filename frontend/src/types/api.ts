export type UserRole = "ADMIN" | "FRONT_DESK" | "HOUSEKEEPING" | "ENGINEER" | "FOOD_BEVERAGE";
export type UserStatus = "IDLE" | "BUSY";
export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "PENDING_FRONT_DESK"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type AssetType = "ROOM" | "EQUIPMENT" | "FACILITY";
export type AssetStatus = "OPERATIONAL" | "MAINTENANCE" | "OUT_OF_ORDER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  skills: string[];
  department?: Department;
}

export interface Asset {
  id: string;
  name: string;
  code: string;
  type: AssetType;
  status: AssetStatus;
  location: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  unit: string;
  unitCost: string;
  reorderLevel: number;
}

export interface TicketUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface TicketAttachment {
  id: string;
  url: string;
  mimeType: string;
  kind: "COMPLETION" | "ESCALATION";
  createdAt: string;
}

export interface MaintenanceTicket {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  triggeredAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  resolutionNote: string | null;
  resolutionType: "COMPLETED" | "NEEDS_FRONT_DESK" | null;
  resolutionAt: string | null;
  frontDeskNote: string | null;
  asset: Pick<Asset, "id" | "name" | "code" | "type" | "status">;
  triggeredBy: TicketUser;
  assignedTo: TicketUser | null;
  attachments: TicketAttachment[];
}

export interface CreateTicketResponse {
  ticket: MaintenanceTicket;
  autoDispatched: boolean;
}

export interface InventoryUsage {
  inventoryId: string;
  quantity: number;
}

export interface CostLog {
  id: string;
  description: string;
  amount: string;
  category: string | null;
  recordedAt: string;
  ticketId: string | null;
  ticket?: {
    id: string;
    title: string;
    status: string;
    asset: { id: string; name: string; code: string };
  } | null;
}

export type ShiftType = "MORNING" | "AFTERNOON" | "NIGHT";
export type ShiftLogbookStatus = "OPEN" | "PUBLISHED";

export type RoutingVisibility = "internal" | "shared";
export type RoutingUrgency = "low" | "medium" | "high";

export interface RoutingDecision {
  visibility: RoutingVisibility;
  shared_with: string[];
  reason: string;
  urgency: RoutingUrgency;
}

export interface ShiftLogEntry {
  id: string;
  content: string;
  visibility?: "INTERNAL" | "SHARED";
  sharedWith?: Department[];
  routingReason?: string | null;
  urgency?: "LOW" | "MEDIUM" | "HIGH";
  sourceDepartment?: Department | null;
  isRoutedMirror?: boolean;
  createdAt: string;
  author: { id: string; name: string };
}

export interface ShiftLogbook {
  id: string;
  department: Department;
  departmentLabel: string;
  shiftType: ShiftType;
  shiftLabel: string;
  shiftDate: string;
  shiftWindow: string;
  shiftStart: string;
  shiftEnd: string;
  status: ShiftLogbookStatus;
  aiSummary: string | null;
  highlights: string[];
  openItems: string[];
  createdBy: { id: string; name: string };
  publishedBy: { id: string; name: string } | null;
  publishedAt: string | null;
  entries: ShiftLogEntry[];
  createdAt: string;
}

export type Department =
  | "FRONT_DESK"
  | "FOOD_BEVERAGE"
  | "HOUSEKEEPING"
  | "ENGINEERING"
  | "MANAGEMENT";

export type ServiceRequestType = "RESTAURANT_RESERVATION" | "GENERAL";
export type ServiceRequestStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED";

export type ReminderStatus = "SCHEDULED" | "TRIGGERED" | "DISMISSED" | "CANCELLED";

export interface ServiceRequestUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface ServiceRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  title: string;
  description: string | null;
  guestRoom: string;
  guestName: string;
  targetDepartment: Department;
  sourceDepartment: Department;
  scheduledAt: string;
  reminderAt: string | null;
  responseNote: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  acceptedAt: string | null;
  completionPhotoUrl: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  createdBy: ServiceRequestUser;
  handledBy: ServiceRequestUser | null;
  reminders: Array<{
    id: string;
    title: string;
    remindAt: string;
    status: ReminderStatus;
    triggeredAt: string | null;
  }>;
}

export interface Reminder {
  id: string;
  title: string;
  message: string;
  remindAt: string;
  status: ReminderStatus;
  notifyDepartment: Department;
  triggeredAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  serviceRequest: {
    id: string;
    title: string;
    guestRoom: string;
    guestName: string;
    scheduledAt: string;
    status: ServiceRequestStatus;
    responseNote: string | null;
    targetDepartment: Department;
  } | null;
  maintenanceTicket: {
    id: string;
    title: string;
    status: string;
    resolutionNote: string | null;
    asset: { code: string; name: string };
  } | null;
  guestRequest: {
    id: string;
    requestType: string;
    status: string;
    targetDepartment: Department;
    roomNumber: string;
    hotelName: string;
  } | null;
}

export type GuestRequestStatus = "pending" | "processing" | "completed";

export interface GuestRequestItem {
  id: string;
  hotel_id: string;
  room_id: string;
  room_number: string;
  hotel_name: string;
  request_type: string;
  request_label: string;
  target_department: Department;
  status: GuestRequestStatus;
  status_label: string;
  notes: string | null;
  handled_by: { id: string; name: string } | null;
  created_at: string;
  completed_at: string | null;
}

export interface GuestRoom {
  id: string;
  roomNumber: string;
  qrToken: string;
  scanUrl: string;
  asset: { id: string; name: string; status: string } | null;
  createdAt: string;
}

export interface GuestRoomInfo {
  room_id: string;
  room_number: string;
  hotel_id: string;
  hotel_name: string;
}

export interface LogbookCurrentResponse {
  department: Department;
  shift: {
    type: ShiftType;
    label: string;
    window: string;
    shiftStart: string;
    shiftEnd: string;
  };
  logbook: ShiftLogbook;
  previousHandover: ShiftLogbook | null;
  shiftDraft: ShiftDraft;
}

export interface ShiftDraftItem {
  id: string;
  kind:
    | "ticket_open"
    | "ticket_created"
    | "service_pending"
    | "guest_pending"
    | "location"
    | "inventory";
  title: string;
  detail?: string;
}

export interface ShiftDraft {
  items: ShiftDraftItem[];
  refreshedAt: string;
}

export type HandoverItemType = "HIGHLIGHT" | "OPEN_ITEM";

export interface HandoverAckItem {
  itemType: HandoverItemType;
  itemIndex: number;
  completedAt: string;
  completedBy: { id: string; name: string };
}

export interface HomeTodoItem {
  id: string;
  kind: "guest_request" | "service_request" | "maintenance_ticket" | "reminder";
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
}

export interface HomeResponse {
  department: Department;
  shift: { label: string; window: string };
  todos: HomeTodoItem[];
  previousHandover: ShiftLogbook | null;
  handoverAcks: HandoverAckItem[];
}
