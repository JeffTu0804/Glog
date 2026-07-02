import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { generateQrToken, getHotelByTenantId } from "./hotelBootstrapService.js";

const FRONTEND_URL = process.env.FRONTEND_URL?.trim() || "http://localhost:5173";

export function buildGuestScanUrl(qrToken: string): string {
  return `${FRONTEND_URL}/guest?t=${encodeURIComponent(qrToken)}`;
}

export async function listRoomsForTenant(tenantId: string) {
  const hotel = await getHotelByTenantId(tenantId);
  if (!hotel) {
    throw new AppError(404, "尚未建立住客 QR 飯店資料，請先同步客房");
  }

  const rooms = await prisma.room.findMany({
    where: { hotelId: hotel.id },
    include: { asset: { select: { id: true, name: true, status: true } } },
    orderBy: { roomNumber: "asc" },
  });

  return rooms.map((r) => ({
    id: r.id,
    roomNumber: r.roomNumber,
    qrToken: r.qrToken,
    scanUrl: buildGuestScanUrl(r.qrToken),
    asset: r.asset,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function regenerateRoomQrToken(tenantId: string, roomId: string) {
  const hotel = await getHotelByTenantId(tenantId);
  if (!hotel) throw new AppError(404, "找不到飯店資料");

  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId: hotel.id },
  });
  if (!room) throw new AppError(404, "找不到客房");

  let token = generateQrToken();
  for (let i = 0; i < 10; i++) {
    const clash = await prisma.room.findUnique({ where: { qrToken: token } });
    if (!clash || clash.id === room.id) break;
    token = generateQrToken();
  }

  const updated = await prisma.room.update({
    where: { id: roomId },
    data: { qrToken: token },
  });

  return {
    id: updated.id,
    roomNumber: updated.roomNumber,
    qrToken: updated.qrToken,
    scanUrl: buildGuestScanUrl(updated.qrToken),
  };
}

export async function updateHotelLineToken(
  tenantId: string,
  lineOfficialToken: string | null,
) {
  const hotel = await getHotelByTenantId(tenantId);
  if (!hotel) throw new AppError(404, "找不到飯店資料");

  const updated = await prisma.hotel.update({
    where: { id: hotel.id },
    data: { lineOfficialToken: lineOfficialToken?.trim() || null },
  });

  return {
    id: updated.id,
    name: updated.name,
    lineOfficialToken: updated.lineOfficialToken,
  };
}
