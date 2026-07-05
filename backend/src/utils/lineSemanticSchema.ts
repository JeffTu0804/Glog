import type {
  LineSemanticAlertData,
  LineSemanticEventData,
  LineSemanticParseResult,
  LineSemanticTaskData,
} from "../types/lineWebhook.js";

const TASK_CATEGORIES = new Set(["維修", "清潔", "客務"]);
const ALERT_LEVELS = new Set(["high", "medium"]);

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseTaskData(value: unknown): LineSemanticTaskData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const category = asString(raw.category);
  if (!TASK_CATEGORIES.has(category)) return null;

  return {
    room_number: asString(raw.room_number),
    category: category as LineSemanticTaskData["category"],
    description: asString(raw.description),
    assigned_to: asString(raw.assigned_to),
  };
}

function parseAlertData(value: unknown): LineSemanticAlertData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const level = asString(raw.level);
  if (!ALERT_LEVELS.has(level)) return null;

  return {
    room_number: asString(raw.room_number),
    description: asString(raw.description),
    level: level as LineSemanticAlertData["level"],
  };
}

function parseEventData(value: unknown): LineSemanticEventData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    time: asString(raw.time),
    title: asString(raw.title),
    description: asString(raw.description),
  };
}

export function parseLineSemanticResult(raw: unknown): LineSemanticParseResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const has_task = obj.has_task === true;
  const has_alert = obj.has_alert === true;
  const has_event = obj.has_event === true;

  const task_data = has_task ? parseTaskData(obj.task_data) : null;
  const alert_data = has_alert ? parseAlertData(obj.alert_data) : null;
  const event_data = has_event ? parseEventData(obj.event_data) : null;

  return {
    has_task: has_task && !!task_data?.description,
    task_data,
    has_alert: has_alert && !!alert_data?.description,
    alert_data,
    has_event: has_event && !!event_data?.title,
    event_data,
  };
}
