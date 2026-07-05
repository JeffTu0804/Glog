import { AssetStatus, TicketStatus, UserRole, UserStatus, type Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * 依 IDLE 狀態與 skills 匹配最佳房務人員。
 */
export async function findBestAvailableHousekeeper(
  db: DbClient,
  tenantId: string,
) {
  const staff = await db.user.findMany({
    where: {
      tenantId,
      role: UserRole.HOUSEKEEPING,
      status: UserStatus.IDLE,
    },
  });

  return staff[0] ?? null;
}

/**
 * 將工單指派給房務人員（結構對齊工程派單，供日後擴充相同閉環）。
 */
export async function assignHousekeeperInTransaction(
  db: DbClient,
  tenantId: string,
  ticketId: string,
  housekeeperId: string,
  assetId: string,
) {
  const housekeeper = await db.user.findFirst({
    where: { id: housekeeperId, tenantId, role: UserRole.HOUSEKEEPING },
  });

  if (!housekeeper) {
    throw new AppError(404, "找不到房務人員");
  }

  if (housekeeper.status !== UserStatus.IDLE) {
    throw new AppError(400, "房務人員目前忙碌中，無法派單");
  }

  const now = new Date();

  await db.user.update({
    where: { id: housekeeperId },
    data: { status: UserStatus.BUSY },
  });

  await db.asset.update({
    where: { id: assetId },
    data: { status: AssetStatus.MAINTENANCE },
  });

  return db.maintenanceTicket.update({
    where: { id: ticketId },
    data: {
      assignedToId: housekeeperId,
      status: TicketStatus.ASSIGNED,
      assignedAt: now,
    },
  });
}

/**
 * 嘗試自動派單給房務；若無可用人員則僅標記資產維護中。
 */
export async function tryAutoDispatchHousekeeping(
  db: DbClient,
  tenantId: string,
  ticketId: string,
  assetId: string,
) {
  const housekeeper = await findBestAvailableHousekeeper(db, tenantId);

  if (housekeeper) {
    await assignHousekeeperInTransaction(
      db,
      tenantId,
      ticketId,
      housekeeper.id,
      assetId,
    );
    return { dispatched: true as const, housekeeperId: housekeeper.id };
  }

  await db.asset.update({
    where: { id: assetId },
    data: { status: AssetStatus.MAINTENANCE },
  });

  return { dispatched: false as const, housekeeperId: null };
}

/**
 * 依 IDLE 狀態與 skills 匹配最佳工程師。
 * - 若指定 requiredSkills，工程師至少需匹配一項標籤
 * - 依匹配標籤數量降序排序，取最高分者
 */
export async function findBestAvailableEngineer(
  db: DbClient,
  tenantId: string,
  requiredSkills: string[],
) {
  const engineers = await db.user.findMany({
    where: {
      tenantId,
      role: UserRole.ENGINEER,
      status: UserStatus.IDLE,
    },
  });

  const candidates =
    requiredSkills.length === 0
      ? engineers
      : engineers.filter((engineer) =>
          requiredSkills.some((skill) => engineer.skills.includes(skill)),
        );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => {
    const scoreA = requiredSkills.filter((s) => a.skills.includes(s)).length;
    const scoreB = requiredSkills.filter((s) => b.skills.includes(s)).length;
    return scoreB - scoreA;
  })[0];
}

/**
 * 將工單指派給工程師，並同步更新工程師狀態為 BUSY、資產為 MAINTENANCE。
 */
export async function assignEngineerInTransaction(
  db: DbClient,
  tenantId: string,
  ticketId: string,
  engineerId: string,
  assetId: string,
) {
  const engineer = await db.user.findFirst({
    where: { id: engineerId, tenantId, role: UserRole.ENGINEER },
  });

  if (!engineer) {
    throw new AppError(404, "找不到工程師或該使用者不是工程師");
  }

  if (engineer.status !== UserStatus.IDLE) {
    throw new AppError(400, "工程師目前忙碌中，無法派單");
  }

  const now = new Date();

  await db.user.update({
    where: { id: engineerId },
    data: { status: UserStatus.BUSY },
  });

  await db.asset.update({
    where: { id: assetId },
    data: { status: AssetStatus.MAINTENANCE },
  });

  return db.maintenanceTicket.update({
    where: { id: ticketId },
    data: {
      assignedToId: engineerId,
      status: TicketStatus.ASSIGNED,
      assignedAt: now,
    },
  });
}

/**
 * 嘗試自動派單；若無可用工程師則僅將資產標記為 MAINTENANCE。
 */
export async function tryAutoDispatch(
  db: DbClient,
  tenantId: string,
  ticketId: string,
  assetId: string,
  requiredSkills: string[],
) {
  const engineer = await findBestAvailableEngineer(db, tenantId, requiredSkills);

  if (engineer) {
    await assignEngineerInTransaction(
      db,
      tenantId,
      ticketId,
      engineer.id,
      assetId,
    );
    return { dispatched: true as const, engineerId: engineer.id };
  }

  await db.asset.update({
    where: { id: assetId },
    data: { status: AssetStatus.MAINTENANCE },
  });

  return { dispatched: false as const, engineerId: null };
}
