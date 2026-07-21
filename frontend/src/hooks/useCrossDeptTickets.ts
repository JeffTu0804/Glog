import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export type CrossDeptDepartment =
  | "front_desk"
  | "housekeeping"
  | "engineering"
  | "purchasing"
  | "spa";

export type CrossDeptTicketStatus =
  | "pending"
  | "processing"
  | "completed"
  | "delayed";

export interface CrossDeptEmployeeRef {
  id: string;
  name: string;
  department: string;
}

export interface CrossDeptTicket {
  id: string;
  hotelId: string;
  caseNumber: string | null;
  fromDepartment: string;
  toDepartment: string;
  createdByEmployeeId: string;
  handledByEmployeeId: string | null;
  description: string;
  status: CrossDeptTicketStatus;
  delayReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: CrossDeptEmployeeRef;
  handledBy?: CrossDeptEmployeeRef | null;
}

function mapRow(row: Record<string, unknown>): CrossDeptTicket {
  return {
    id: String(row.id),
    hotelId: String(row.hotelId ?? row.hotel_id ?? ""),
    caseNumber: (row.caseNumber ?? row.case_number ?? null) as string | null,
    fromDepartment: String(row.fromDepartment ?? row.from_department ?? ""),
    toDepartment: String(row.toDepartment ?? row.to_department ?? ""),
    createdByEmployeeId: String(
      row.createdByEmployeeId ?? row.created_by_employee_id ?? "",
    ),
    handledByEmployeeId: (row.handledByEmployeeId ??
      row.handled_by_employee_id ??
      null) as string | null,
    description: String(row.description ?? ""),
    status: String(row.status ?? "pending") as CrossDeptTicketStatus,
    delayReason: (row.delayReason ?? row.delay_reason ?? null) as string | null,
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    createdBy: row.createdBy as CrossDeptEmployeeRef | undefined,
    handledBy: (row.handledBy as CrossDeptEmployeeRef | null | undefined) ?? null,
  };
}

/**
 * 管理看板：首次 fetch + 輪詢更新 tickets
 */
export function useCrossDeptTickets(hotelIdOverride?: string) {
  const { getToken } = useAuth();
  const [tickets, setTickets] = useState<CrossDeptTicket[]>([]);
  const [hotelId, setHotelId] = useState(hotelIdOverride ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      const res = await api.getCrossDeptTickets(token, hotelIdOverride);
      setHotelId(res.hotelId);
      setTickets(
        res.tickets.map((t) => mapRow(t as unknown as Record<string, unknown>)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [getToken, hotelIdOverride]);

  useEffect(() => {
    void load();
  }, [load]);

  // 輪詢取代 Supabase Realtime（認證已改 Mongo）
  useEffect(() => {
    if (!hotelId) return;
    const timer = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hotelId, load]);

  return { tickets, hotelId, loading, error, refresh: load };
}
