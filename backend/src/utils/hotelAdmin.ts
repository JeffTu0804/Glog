import type { UserPositionLevel, UserRole } from "@prisma/client";

/** 飯店 Admin：系統管理員，或問卷職稱主管／經理 */
export function isHotelAdminRole(input: {
  role: UserRole;
  positionLevel: UserPositionLevel;
}): boolean {
  return (
    input.role === "ADMIN" ||
    input.positionLevel === "SUPERVISOR" ||
    input.positionLevel === "MANAGER"
  );
}
