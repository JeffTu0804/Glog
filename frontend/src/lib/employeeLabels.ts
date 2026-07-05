export type UserAccountStatus = "ACTIVE" | "DISABLED" | "SUSPENDED";
export type UserPositionLevel = "STAFF" | "SUPERVISOR" | "MANAGER";

export const ACCOUNT_STATUS_LABELS: Record<UserAccountStatus, string> = {
  ACTIVE: "啟用",
  DISABLED: "停用",
  SUSPENDED: "暫時停用",
};

export const POSITION_LEVEL_LABELS: Record<UserPositionLevel, string> = {
  STAFF: "員工",
  SUPERVISOR: "主管",
  MANAGER: "經理",
};

export const ALL_ACCOUNT_STATUSES: UserAccountStatus[] = [
  "ACTIVE",
  "DISABLED",
  "SUSPENDED",
];

export const ALL_POSITION_LEVELS: UserPositionLevel[] = [
  "STAFF",
  "SUPERVISOR",
  "MANAGER",
];
