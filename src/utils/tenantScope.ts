/**
 * 產生 Prisma where 條件，強制限定在指定租戶範圍內。
 * 所有核心業務表的 CRUD 操作都應透過此 helper 帶入 tenantId。
 */
export function tenantWhere(tenantId: string) {
  return { tenantId } as const;
}

/**
 * 合併額外查詢條件與租戶隔離條件。
 */
export function withTenantScope<T extends Record<string, unknown>>(
  tenantId: string,
  where: T,
): T & { tenantId: string } {
  return { ...where, tenantId };
}
