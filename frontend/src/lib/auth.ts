const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function parseApiResponse<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      throw new Error(
        res.status === 502 || res.status === 503
          ? "後端服務未啟動，請在另一個終端機執行 npm run dev:backend"
          : `伺服器錯誤（${res.status}）`,
      );
    }
    return {} as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error("伺服器回應格式錯誤，請確認後端已啟動");
  }
}

export async function registerHotel(
  token: string,
  body: { hotelName: string; slug: string; adminName: string },
) {
  const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await parseApiResponse<{ error?: string }>(res);

  if (!res.ok) {
    throw new Error(data.error ?? "註冊失敗");
  }

  return data;
}

export type JoinableRole =
  | "FRONT_DESK"
  | "HOUSEKEEPING"
  | "ENGINEER"
  | "FOOD_BEVERAGE";

export type PositionLevel = "STAFF" | "SUPERVISOR" | "MANAGER";

export async function joinHotel(
  token: string,
  body: {
    slug: string;
    name: string;
    role: JoinableRole;
    positionLevel?: PositionLevel;
  },
) {
  const res = await fetch(`${API_BASE}/api/v1/auth/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await parseApiResponse<{ error?: string }>(res);

  if (!res.ok) {
    throw new Error(data.error ?? "加入飯店失敗");
  }

  return data;
}

export async function lookupTenantBySlug(token: string, slug: string) {
  const params = new URLSearchParams({ slug });
  const res = await fetch(`${API_BASE}/api/v1/auth/tenants/lookup?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await parseApiResponse<{
    found: boolean;
    tenant?: { name: string; slug: string };
    error?: string;
  }>(res);

  if (!res.ok) {
    throw new Error(data.error ?? "查詢失敗");
  }

  return data;
}

export async function checkAuthStatus(token: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await parseApiResponse<{
    registered: boolean;
    isLineUser?: boolean;
    error?: string;
  }>(res);

  if (!res.ok) {
    throw new Error(data.error ?? "驗證失敗");
  }

  return data;
}

export function getOAuthRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

export function signInWithLine(target: "hotel" | "platform" = "hotel") {
  // 走後端自訂 LINE OAuth（Supabase 雲端尚未全面支援內建 line provider）
  window.location.href = `${API_BASE}/api/v1/auth/line/login?target=${target}`;
}
