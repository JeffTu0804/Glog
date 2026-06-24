import type { Prisma } from "@prisma/client";

const HOTEL_FLOORS = 10;
const ROOMS_PER_FLOOR = 10;

/** 產生飯店客房：10 層 × 每層 10 間（101–110、201–210 … 1001–1010） */
export function buildHotelRoomAssets() {
  const assets: Array<{
    code: string;
    name: string;
    type: "ROOM";
    location: string;
  }> = [];

  for (let floor = 1; floor <= HOTEL_FLOORS; floor++) {
    for (let room = 1; room <= ROOMS_PER_FLOOR; room++) {
      const code =
        floor < 10
          ? `${floor}${String(room).padStart(2, "0")}`
          : `10${String(room).padStart(2, "0")}`;

      assets.push({
        code,
        name: `${code} 號房`,
        type: "ROOM",
        location: `${floor}F`,
      });
    }
  }

  return assets;
}

export async function seedStarterAssets(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  await tx.asset.createMany({
    data: buildHotelRoomAssets().map((asset) => ({ tenantId, ...asset })),
    skipDuplicates: true,
  });
}
