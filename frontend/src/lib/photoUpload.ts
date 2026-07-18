const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** 將後端回傳的相對路徑轉為可顯示的完整 URL */
export function uploadUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export async function fileToOptionalPhotoPayload(
  files: FileList | null | undefined,
): Promise<{ data: string; mimeType: string } | null> {
  if (!files?.length) return null;
  const photos = await filesToPhotoPayload(files);
  return photos[0] ?? null;
}

export async function filesToPhotoPayload(files: FileList | File[]) {
  const list = Array.from(files);
  const photos: Array<{ data: string; mimeType: string }> = [];

  for (const file of list) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("讀取照片失敗"));
      reader.readAsDataURL(file);
    });
    photos.push({
      data: dataUrl,
      mimeType: file.type || "image/jpeg",
    });
  }

  return photos;
}
