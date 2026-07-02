import { Department, UserRole } from "@prisma/client";

export const GUEST_REQUEST_TYPES = [
  "towels",
  "cleaning",
  "maintenance",
  "amenities",
  "other",
] as const;

export type GuestRequestType = (typeof GUEST_REQUEST_TYPES)[number];

export const GUEST_REQUEST_LABELS: Record<GuestRequestType, string> = {
  towels: "補充毛巾",
  cleaning: "客房清潔",
  maintenance: "設備維修",
  amenities: "備品補充",
  other: "其他需求",
};

export const GUEST_REQUEST_DEPARTMENT: Record<GuestRequestType, Department> = {
  towels: Department.HOUSEKEEPING,
  cleaning: Department.HOUSEKEEPING,
  maintenance: Department.ENGINEERING,
  amenities: Department.HOUSEKEEPING,
  other: Department.FRONT_DESK,
};

export const GUEST_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
};

export function isGuestRequestType(value: string): value is GuestRequestType {
  return (GUEST_REQUEST_TYPES as readonly string[]).includes(value);
}

export function departmentForGuestRequestType(type: GuestRequestType): Department {
  return GUEST_REQUEST_DEPARTMENT[type];
}

export function canHandleGuestRequest(role: UserRole, department: Department): boolean {
  if (role === UserRole.ADMIN || role === UserRole.FRONT_DESK) return true;
  if (department === Department.HOUSEKEEPING) return role === UserRole.HOUSEKEEPING;
  if (department === Department.ENGINEERING) return role === UserRole.ENGINEER;
  if (department === Department.FOOD_BEVERAGE) return role === UserRole.FOOD_BEVERAGE;
  return false;
}

export const GUEST_SLA_MINUTES = 30;
