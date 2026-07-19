import { useCallback, useEffect, useState } from "react";
import {
  ChatHub,
  type ChatHubMessage,
  type ChatHubTicket,
  type ChatHubThread,
} from "../components/chat/ChatHub";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export function ChatHubPage() {
  const { getToken } = useAuth();
  const [hotelName, setHotelName] = useState("glog");
  const [threads, setThreads] = useState<ChatHubThread[]>([]);
  const [messages, setMessages] = useState<ChatHubMessage[]>([]);
  const [tickets, setTickets] = useState<ChatHubTicket[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const data = await api.getChatThreads(token);
      setHotelName(data.hotelName);
      setThreads(data.threads as ChatHubThread[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // 進入中控台預設選第一位有對話的員工（否則第一位）
  useEffect(() => {
    if (selectedStaffId || threads.length === 0) return;
    const withChat = threads.find((t) => t.lastMessage);
    setSelectedStaffId((withChat ?? threads[0]).staff.id);
  }, [threads, selectedStaffId]);

  useEffect(() => {
    if (!selectedStaffId) {
      setMessages([]);
      setTickets([]);
      return;
    }

    let cancelled = false;
    async function loadDetail() {
      try {
        const token = await getToken();
        const [msgRes, ticketRes] = await Promise.all([
          api.getChatMessages(token, selectedStaffId!),
          api.getChatTickets(token, selectedStaffId!),
        ]);
        if (cancelled) return;
        setMessages(msgRes.messages as ChatHubMessage[]);
        setTickets(ticketRes.tickets as ChatHubTicket[]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "載入對話失敗");
        }
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedStaffId, getToken]);

  async function handleSend(content: string) {
    if (!selectedStaffId) return;
    const token = await getToken();
    await api.sendChatMessage(token, selectedStaffId, { content });
    const msgRes = await api.getChatMessages(token, selectedStaffId);
    setMessages(msgRes.messages as ChatHubMessage[]);
    await loadThreads();
  }

  async function handleRefresh() {
    await loadThreads();
    if (!selectedStaffId) return;
    try {
      const token = await getToken();
      const [msgRes, ticketRes] = await Promise.all([
        api.getChatMessages(token, selectedStaffId),
        api.getChatTickets(token, selectedStaffId),
      ]);
      setMessages(msgRes.messages as ChatHubMessage[]);
      setTickets(ticketRes.tickets as ChatHubTicket[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新整理失敗");
    }
  }

  return (
    <div>
      <PageHeader
        title="對話中控台"
        subtitle="LINE 推播與接單紀錄，點擊訊息錨點可對齊右側工單"
        accent="blue"
        action={
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading}
            className="glog-btn-secondary"
          >
            重新整理
          </button>
        }
      />
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ChatHub
        hotelName={hotelName}
        threads={threads}
        messages={messages}
        tickets={tickets}
        loading={loading}
        selectedStaffId={selectedStaffId}
        onSelectStaff={setSelectedStaffId}
        onSendMessage={handleSend}
      />
    </div>
  );
}
