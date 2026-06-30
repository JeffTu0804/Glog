import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "tickets");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 5 * 1024 * 1024;

export interface PhotoInput {
  data: string;
  mimeType: string;
}

export async function saveTicketPhotos(
  tenantId: string,
  ticketId: string,
  photos: PhotoInput[],
): Promise<string[]> {
  if (photos.length === 0) {
    throw new Error("至少需要一張照片");
  }
  if (photos.length > 5) {
    throw new Error("最多上傳 5 張照片");
  }

  const dir = path.join(UPLOAD_ROOT, tenantId, ticketId);
  await mkdir(dir, { recursive: true });

  const urls: string[] = [];

  for (const photo of photos) {
    if (!ALLOWED_MIME.has(photo.mimeType)) {
      throw new Error(`不支援的圖片格式：${photo.mimeType}`);
    }

    const base64 = photo.data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length > MAX_BYTES) {
      throw new Error("單張照片不可超過 5MB");
    }

    const ext = photo.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const filename = `${randomBytes(8).toString("hex")}.${ext}`;
    await writeFile(path.join(dir, filename), buffer);
    urls.push(`/api/v1/uploads/tickets/${tenantId}/${ticketId}/${filename}`);
  }

  return urls;
}

export function getUploadRoot() {
  return UPLOAD_ROOT;
}
