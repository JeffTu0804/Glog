import type { User } from "../types/api";

/** 問卷職稱主管／經理，或系統 ADMIN，可進飯店 Admin */
export function isHotelAdmin(user: Pick<User, "role" | "positionLevel"> | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === "ADMIN" ||
    user.positionLevel === "SUPERVISOR" ||
    user.positionLevel === "MANAGER"
  );
}
