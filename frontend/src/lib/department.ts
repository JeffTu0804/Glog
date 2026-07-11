import type { Department, UserRole } from "../types/api";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  FRONT_DESK: "客務部",
  FOOD_BEVERAGE: "餐飲部",
  HOUSEKEEPING: "房務部",
  ENGINEERING: "工程部",
  MANAGEMENT: "管理層",
};

export const ALL_DEPARTMENTS: Department[] = [
  "FRONT_DESK",
  "FOOD_BEVERAGE",
  "HOUSEKEEPING",
  "ENGINEERING",
  "MANAGEMENT",
];

export function roleToDepartment(role: UserRole): Department {
  switch (role) {
    case "FRONT_DESK":
      return "FRONT_DESK";
    case "FOOD_BEVERAGE":
      return "FOOD_BEVERAGE";
    case "HOUSEKEEPING":
      return "HOUSEKEEPING";
    case "ENGINEER":
      return "ENGINEERING";
    case "ADMIN":
      return "MANAGEMENT";
    default:
      return "FRONT_DESK";
  }
}

export function rolesForDepartment(department: Department): UserRole[] {
  switch (department) {
    case "FRONT_DESK":
      return ["FRONT_DESK"];
    case "FOOD_BEVERAGE":
      return ["FOOD_BEVERAGE"];
    case "HOUSEKEEPING":
      return ["HOUSEKEEPING"];
    case "ENGINEERING":
      return ["ENGINEER"];
    case "MANAGEMENT":
      return ["ADMIN"];
  }
}

export function departmentToRole(department: Department): UserRole {
  return rolesForDepartment(department)[0]!;
}

export function canAccessDepartment(role: UserRole, department: Department): boolean {
  if (role === "ADMIN") return true;
  return roleToDepartment(role) === department;
}
