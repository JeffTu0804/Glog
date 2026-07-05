import { AssetType, UserRole, type User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";

export interface ResolvedLineStaff {
  user: User;
  tenantId: string;
}

/** 依 LINE userId 查詢已 onboarding 的員工 */
export async function resolveStaffByLineUserId(
  lineUserId: string,
): Promise<ResolvedLineStaff | null> {
  const user = await prisma.user.findFirst({
    where: { lineUserId },
  });

  if (!user) return null;
  return { user, tenantId: user.tenantId };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 依姓名在租戶內查找員工（精確 → 包含匹配）
 */
export async function findUserByNameInTenant(
  tenantId: string,
  name: string,
  roles?: UserRole[],
): Promise<User | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const where = withTenantScope(tenantId, {
    ...(roles?.length ? { role: { in: roles } } : {}),
  });

  const users = await prisma.user.findMany({ where });
  if (users.length === 0) return null;

  const normalized = normalizeName(trimmed);
  const exact = users.find((u) => normalizeName(u.name) === normalized);
  if (exact) return exact;

  const partial = users.find(
    (u) =>
      normalizeName(u.name).includes(normalized) ||
      normalized.includes(normalizeName(u.name)),
  );
  return partial ?? null;
}

/** 依房號查詢 ROOM 類型資產 */
export async function findRoomAssetByNumber(tenantId: string, roomNumber: string) {
  const code = roomNumber.trim().replace(/[^\d]/g, "");
  if (!code) return null;

  return prisma.asset.findFirst({
    where: withTenantScope(tenantId, {
      code,
      type: AssetType.ROOM,
    }),
  });
}
