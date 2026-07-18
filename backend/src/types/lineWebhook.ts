export interface LineWebhookBody {
  destination?: string;
  events: LineWebhookEvent[];
}

export interface LineWebhookEvent {
  type: string;
  message?: LineMessage;
  source?: LineEventSource;
  replyToken?: string;
  timestamp?: number;
  postback?: { data?: string };
}

export interface LineEventSource {
  type: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineMessage {
  id: string;
  type: string;
  text?: string;
  duration?: number;
}

export interface LineSemanticTaskData {
  room_number: string;
  category: "維修" | "清潔" | "客務";
  description: string;
  assigned_to: string;
}

export interface LineSemanticAlertData {
  room_number: string;
  description: string;
  level: "high" | "medium";
}

export interface LineSemanticEventData {
  time: string;
  title: string;
  description: string;
}

export type RoutingVisibility = "internal" | "shared";
export type RoutingUrgency = "low" | "medium" | "high";
export type RoutingDepartmentSlug =
  | "front_desk"
  | "housekeeping"
  | "engineering"
  | "fb";

export interface RoutingDecision {
  visibility: RoutingVisibility;
  shared_with: string[];
  reason: string;
  urgency: RoutingUrgency;
}

export interface LineSemanticParseResult {
  has_task: boolean;
  task_data: LineSemanticTaskData | null;
  has_alert: boolean;
  alert_data: LineSemanticAlertData | null;
  has_event: boolean;
  event_data: LineSemanticEventData | null;
  routing_decision: RoutingDecision;
}

export interface LineIntentPersistResult {
  tasks: string[];
  alerts: string[];
  events: string[];
  errors: string[];
}
