import type { UserRole } from "../types/api";

/** 登入後預設導向首頁 */
export function getDefaultHomePath(_role?: UserRole): string {
  return "/home";
}
