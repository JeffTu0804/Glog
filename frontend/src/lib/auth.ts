import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

  const data = (await res.json()) as { error?: string };

  if (!res.ok) {
    throw new Error(data.error ?? "註冊失敗");
  }

  return data;
}

export async function checkAuthStatus(token: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json()) as {
    registered: boolean;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error ?? "驗證失敗");
  }

  return data;
}

export function getOAuthRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

export function signInWithLine() {
  // 走後端自訂 LINE OAuth（Supabase 雲端尚未全面支援內建 line provider）
  window.location.href = `${API_BASE}/api/v1/auth/line/login`;
}
