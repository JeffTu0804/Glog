import { Department, UserRole } from "@prisma/client";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  FRONT_DESK: "客務部",
  FOOD_BEVERAGE: "餐飲部",
  HOUSEKEEPING: "房務部",
  ENGINEERING: "工程部",
  MANAGEMENT: "管理層",
};

export const ALL_DEPARTMENTS = Object.values(Department);

export function roleToDepartment(role: UserRole): Department {
  switch (role) {
    case UserRole.FRONT_DESK:
      return Department.FRONT_DESK;
    case UserRole.FOOD_BEVERAGE:
      return Department.FOOD_BEVERAGE;
    case UserRole.HOUSEKEEPING:
      return Department.HOUSEKEEPING;
    case UserRole.ENGINEER:
      return Department.ENGINEERING;
    case UserRole.ADMIN:
      return Department.MANAGEMENT;
    default:
      return Department.FRONT_DESK;
  }
}

export function rolesForDepartment(department: Department): UserRole[] {
  switch (department) {
    case Department.FRONT_DESK:
      return [UserRole.FRONT_DESK];
    case Department.FOOD_BEVERAGE:
      return [UserRole.FOOD_BEVERAGE];
    case Department.HOUSEKEEPING:
      return [UserRole.HOUSEKEEPING];
    case Department.ENGINEERING:
      return [UserRole.ENGINEER];
    case Department.MANAGEMENT:
      return [UserRole.ADMIN];
  }
}

/** 部門對應的預設角色（一對一） */
export function departmentToRole(department: Department): UserRole {
  return rolesForDepartment(department)[0]!;
}

export function canAccessDepartment(
  role: UserRole,
  department: Department,
): boolean {
  if (role === UserRole.ADMIN) return true;
  return roleToDepartment(role) === department;
}

export function canHandleDepartment(
  role: UserRole,
  target: Department,
): boolean {
  if (role === UserRole.ADMIN) return true;
  return roleToDepartment(role) === target;
}

export function canCreateServiceRequest(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.FRONT_DESK ||
    role === UserRole.HOUSEKEEPING
  );
}
