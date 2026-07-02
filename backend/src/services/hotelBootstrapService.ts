import { createHash, randomBytes } from "node:crypto";
import { AssetType, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export function generateQrToken(): string {
  return createHash("md5")
    .update(randomBytes(16).toString("hex") + Date.now().toString())
    .digest("hex")
    .slice(0, 8);
}

/** 註冊或同步時：確保 Tenant 有對應 Hotel */
export async function ensureHotelForTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  hotelName: string,
) {
  const existing = await tx.hotel.findUnique({ where: { tenantId } });
  if (existing) return existing;

  return tx.hotel.create({
    data: { tenantId, name: hotelName },
  });
}

/** 從 Asset（客房）同步 Room + qr_token */
export async function syncRoomsFromAssets(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  const hotel = await tx.hotel.findUnique({ where: { tenantId } });
  if (!hotel) return { created: 0, updated: 0 };

  const assets = await tx.asset.findMany({
    where: { tenantId, type: AssetType.ROOM },
    orderBy: { code: "asc" },
  });

  let created = 0;
  let updated = 0;

  for (const asset of assets) {
    const existing = await tx.room.findUnique({
      where: { hotelId_roomNumber: { hotelId: hotel.id, roomNumber: asset.code } },
    });

    if (existing) {
      if (existing.assetId !== asset.id) {
        await tx.room.update({
          where: { id: existing.id },
          data: { assetId: asset.id },
        });
        updated += 1;
      }
      continue;
    }

    await tx.room.create({
      data: {
        hotelId: hotel.id,
        roomNumber: asset.code,
        assetId: asset.id,
        qrToken: generateQrToken(),
      },
    });
    created += 1;
  }

  return { created, updated };
}

export async function getHotelByTenantId(tenantId: string) {
  return prisma.hotel.findUnique({
    where: { tenantId },
    include: { _count: { select: { rooms: true } } },
  });
}
