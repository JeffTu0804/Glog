import type { UserRole } from "../types/api";

/** 登入後預設導向：營運中控台（對話三欄） */
export function getDefaultHomePath(_role?: UserRole): string {
  return "/chat";
}
