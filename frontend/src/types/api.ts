export type UserRole = "ADMIN" | "FRONT_DESK" | "HOUSEKEEPING" | "ENGINEER";
export type UserStatus = "IDLE" | "BUSY";
export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
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
  asset: Pick<Asset, "id" | "name" | "code" | "type" | "status">;
  triggeredBy: TicketUser;
  assignedTo: TicketUser | null;
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
