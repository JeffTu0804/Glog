import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export type TicketHistoryStatusTab =
  | "all"
  | "pending"
  | "in_progress"
  | "completed";

export type TicketHistoryDepartment =
  | "all"
  | "front_desk"
  | "housekeeping"
  | "engineering"
  | "purchasing";

export interface TicketHistoryItem {
  id: string;
  hotelId: string;
  caseNumber: string | null;
  fromDepartment: string;
  toDepartment: string;
  description: string;
  status: string;
  delayReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; department: string };
  handledBy?: { id: string; name: string; department: string } | null;
}

function mapTicket(row: Record<string, unknown>): TicketHistoryItem {
  return {
    id: String(row.id),
    hotelId: String(row.hotelId ?? row.hotel_id ?? ""),
    caseNumber: (row.caseNumber ?? row.case_number ?? null) as string | null,
    fromDepartment: String(row.fromDepartment ?? row.from_department ?? ""),
    toDepartment: String(row.toDepartment ?? row.to_department ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status ?? "pending"),
    delayReason: (row.delayReason ?? row.delay_reason ?? null) as string | null,
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    createdBy: row.createdBy as TicketHistoryItem["createdBy"],
    handledBy:
      (row.handledBy as TicketHistoryItem["handledBy"]) ?? null,
  };
}

/**
 * 交班頁工單歷史：狀態 Tab × 部門 × 序號搜尋。
 * hotelId 一律由後端依登入 tenant 解析，前端無法偽造跨酒店查詢。
 */
export function useTicketHistory() {
  const { getToken } = useAuth();
  const [statusTab, setStatusTab] = useState<TicketHistoryStatusTab>("all");
  const [department, setDepartment] =
    useState<TicketHistoryDepartment>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tickets, setTickets] = useState<TicketHistoryItem[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 280);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await api.getCrossDeptTickets(token, {
        status: statusTab,
        department: department === "all" ? undefined : department,
        q: debouncedSearch || undefined,
      });
      setHotelId(res.hotelId);
      setTickets(
        res.tickets.map((t) => mapTicket(t as unknown as Record<string, unknown>)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入工單失敗");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, statusTab, department, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    statusTab,
    setStatusTab,
    department,
    setDepartment,
    searchInput,
    setSearchInput,
    tickets,
    hotelId,
    loading,
    error,
    refresh: load,
  };
}
