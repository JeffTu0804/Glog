import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Reminder } from "../types/api";

export function useActiveReminders(pollMs = 60_000) {
  const { getToken } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const { reminders: list } = await api.getActiveReminders(token);
      setReminders(list);
    } catch {
      setReminders([]);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { reminders, reload: load, dismiss: async (id: string) => {
    const token = await getToken();
    await api.dismissReminder(token, id);
    await load();
  }};
}
