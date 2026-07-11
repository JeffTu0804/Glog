import type { Department } from "../types/api";

export const GUEST_REQUEST_OPTIONS = [
  { type: "towels", label: "補充毛巾", icon: "🧺" },
  { type: "cleaning", label: "客房清潔", icon: "🧹" },
  { type: "maintenance", label: "設備維修", icon: "🔧" },
  { type: "amenities", label: "備品補充", icon: "🛁" },
  { type: "other", label: "其他需求", icon: "💬" },
] as const;

export const GUEST_STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  FRONT_DESK: "客務部",
  FOOD_BEVERAGE: "餐飲部",
  HOUSEKEEPING: "房務部",
  ENGINEERING: "工程部",
  MANAGEMENT: "管理層",
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function fetchGuestRoomInfo(qrToken: string) {
  const res = await fetch(
    `${API_BASE}/api/guest/room-info?t=${encodeURIComponent(qrToken)}`,
  );
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "載入失敗");
  return data as {
    room_id: string;
    room_number: string;
    hotel_id: string;
    hotel_name: string;
  };
}

export async function submitGuestRequest(body: {
  hotel_id: string;
  room_id: string;
  request_type: string;
  notes?: string;
}) {
  const res = await fetch(`${API_BASE}/api/guest/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "送出失敗");
  return data;
}

export function qrImageUrl(scanUrl: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(scanUrl)}`;
}
