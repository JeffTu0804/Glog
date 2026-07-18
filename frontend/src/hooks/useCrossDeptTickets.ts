import { useCallback, useEffect, useState } from "react";
import { hotelSupabase } from "../lib/supabase";
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

const ACTIVE = new Set<CrossDeptTicketStatus>([
  "pending",
  "processing",
  "delayed",
]);

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
 * 管理看板：首次 fetch + Supabase Realtime 訂閱 tickets INSERT/UPDATE
 * 工程師標記 delayed 時，delay_reason 會立刻反映在 UI，無需重新整理。
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

  useEffect(() => {
    if (!hotelId) return;

    const channel = hotelSupabase
      .channel(`cross-dept-tickets:${hotelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tickets",
          filter: `hotel_id=eq.${hotelId}`,
        },
        (payload) => {
          const next = mapRow(payload.new as Record<string, unknown>);
          if (!ACTIVE.has(next.status)) return;
          setTickets((prev) => {
            if (prev.some((t) => t.id === next.id)) return prev;
            return [next, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `hotel_id=eq.${hotelId}`,
        },
        (payload) => {
          const next = mapRow(payload.new as Record<string, unknown>);
          setTickets((prev) => {
            const without = prev.filter((t) => t.id !== next.id);
            if (!ACTIVE.has(next.status)) return without;
            return [next, ...without];
          });
        },
      )
      .subscribe();

    return () => {
      void hotelSupabase.removeChannel(channel);
    };
  }, [hotelId]);

  return { tickets, hotelId, loading, error, refresh: load };
}
