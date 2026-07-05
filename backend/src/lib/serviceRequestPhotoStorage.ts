import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "service-requests");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function saveServiceRequestPhoto(
  tenantId: string,
  requestId: string,
  buffer: Buffer,
  mimeType = "image/jpeg",
): Promise<string> {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`不支援的圖片格式：${mimeType}`);
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error("照片不可超過 5MB");
  }

  const dir = path.join(UPLOAD_ROOT, tenantId, requestId);
  await mkdir(dir, { recursive: true });

  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const filename = `${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);

  return `/api/v1/uploads/service-requests/${tenantId}/${requestId}/${filename}`;
}

export function getServiceRequestUploadRoot() {
  return UPLOAD_ROOT;
}
