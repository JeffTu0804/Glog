import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaFrozenWarned?: boolean;
};

/**
 * @deprecated 業務資料已遷移至 MongoDB Atlas。
 * Supabase Postgres（Prisma）已凍結：僅供過渡期 API 相容，勿再擴充 schema／寫入新業務資料。
 * 設 SUPABASE_DB_FROZEN=true（預設）時啟動會印出警告。
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const frozen = (process.env.SUPABASE_DB_FROZEN ?? "true").toLowerCase() !== "false";
if (frozen && !globalForPrisma.prismaFrozenWarned) {
  globalForPrisma.prismaFrozenWarned = true;
  console.warn(
    "[DB] Supabase Postgres（Prisma）已凍結／停用為主資料庫 — 業務資料請以 MongoDB 為準",
  );
}
