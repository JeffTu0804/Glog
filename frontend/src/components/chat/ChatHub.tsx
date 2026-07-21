import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEPARTMENT_LABELS } from "../../lib/department";
import type { Department, UserRole } from "../../types/api";

export type ChatSender = "staff" | "manager" | "system";

export interface ChatHubStaff {
  id: string;
  name: string;
  role: UserRole;
  status: "IDLE" | "BUSY";
  lineUserId: string | null;
}

export interface ChatHubThread {
  staff: ChatHubStaff;
  lastMessage: {
    content: string;
    createdAt: string;
    sender: string;
    ticketId: string | null;
  } | null;
  unreadCount: number;
}

export interface ChatHubMessage {
  id: string;
  sender: ChatSender;
  messageType: string;
  content: string;
  ticketId: string | null;
  ticketKind: string | null;
  createdAt: string;
}

export interface ChatHubTicket {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  guestRoom: string;
  status: "PENDING" | "IN_PROGRESS";
  urgency: string;
  acceptedAt: string | null;
  createdAt: string;
  department: Department;
  createdByName: string;
}

const DEPT_TABS: { id: "ALL" | Department; label: string }[] = [
  { id: "ALL", label: "全部" },
  { id: "HOUSEKEEPING", label: "房務部" },
  { id: "ENGINEERING", label: "工程部" },
  { id: "FRONT_DESK", label: "客務部" },
  { id: "FOOD_BEVERAGE", label: "餐飲部" },
  { id: "MANAGEMENT", label: "管理層" },
];

function roleToDept(role: UserRole): Department {
  switch (role) {
    case "HOUSEKEEPING":
      return "HOUSEKEEPING";
    case "ENGINEER":
      return "ENGINEERING";
    case "FRONT_DESK":
      return "FRONT_DESK";
    case "FOOD_BEVERAGE":
      return "FOOD_BEVERAGE";
    case "ADMIN":
      return "MANAGEMENT";
    default:
      return "FRONT_DESK";
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** 正規化房號顯示：`403` → `403 號房` */
function formatRoomLabel(guestRoom: string): string {
  const room = guestRoom.replace(/號房$/u, "").trim() || guestRoom;
  return `${room} 號房`;
}

/**
 * 從標題抽出核心任務名，去掉重複房號。
 * 例：`403 需要deep cleaning` → `客房清潔 (Deep Cleaning)`
 */
function simplifyTicketTitle(title: string, guestRoom: string): string {
  const room = guestRoom.replace(/號房$/u, "").trim();
  let t = title.trim();
  if (room) {
    t = t
      .replace(new RegExp(`^${escapeRegExp(room)}\\s*號房\\s*`, "u"), "")
      .replace(new RegExp(`^${escapeRegExp(room)}\\s*`, "u"), "");
  }
  t = t
    .replace(/^\d+\s*號房\s*/u, "")
    .replace(/^\d+\s+/u, "")
    .trim();

  if (/deep\s*cleaning|深清|徹底清潔/i.test(t)) {
    return "客房清潔 (Deep Cleaning)";
  }
  if (/加床/.test(t)) return "加床服務";
  if (/補備品|備品/.test(t)) return "補備品服務";
  if (/客房清潔|清潔|打掃/.test(t)) return "客房清潔";

  t = t.replace(/^需要\s*/u, "").trim();
  return t || title.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 描述與標題實質相同時視為冗餘，不另開描述區 */
function hasExtraNote(
  description: string | null,
  title: string,
  guestRoom: string,
): boolean {
  if (!description?.trim()) return false;
  const normalize = (s: string) =>
    s
      .replace(/\d+\s*號房?/gu, "")
      .replace(/需要/gu, "")
      .replace(/\s+/g, "")
      .toLowerCase();

  const desc = normalize(description);
  const titleCore = normalize(simplifyTicketTitle(title, guestRoom));
  const titleRaw = normalize(title);

  if (!desc) return false;
  if (desc === titleCore || desc === titleRaw) return false;
  if (titleCore.includes(desc) || titleRaw.includes(desc)) return false;
  if (desc.includes(titleCore) && titleCore.length >= 2) return false;
  return true;
}

export interface ChatHubProps {
  hotelName: string;
  threads: ChatHubThread[];
  messages: ChatHubMessage[];
  tickets: ChatHubTicket[];
  loading?: boolean;
  selectedStaffId: string | null;
  onSelectStaff: (staffId: string) => void;
  onSendMessage?: (content: string) => Promise<void>;
}

export function ChatHub({
  hotelName,
  threads,
  messages,
  tickets,
  loading,
  selectedStaffId,
  onSelectStaff,
  onSendMessage,
}: ChatHubProps) {
  const [deptTab, setDeptTab] = useState<"ALL" | Department>("ALL");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [highlightedTicketId, setHighlightedTicketId] = useState<string | null>(
    null,
  );
  const [anchorMiss, setAnchorMiss] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  /** 右側工單卡片 DOM，供錨點聯動滾動 */
  const ticketRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredThreads = useMemo(() => {
    if (deptTab === "ALL") return threads;
    return threads.filter((t) => roleToDept(t.staff.role) === deptTab);
  }, [threads, deptTab]);

  const selectedThread = threads.find((t) => t.staff.id === selectedStaffId);

  useEffect(() => {
    setSelectedTicketId(null);
    setHighlightedTicketId(null);
    setAnchorMiss(false);
  }, [selectedStaffId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  /**
   * 點擊訊息工單錨點 → 右側面板平滑滾動至對應卡片並高亮 2 秒
   */
  const handleAnchorClick = useCallback(
    (ticketId: string) => {
      setSelectedTicketId(ticketId);
      setAnchorMiss(false);

      // 優先精確 id；若為 NOTICE id，嘗試以房號／標題模糊對到右側 ServiceRequest 卡片
      let targetId = ticketId;
      let targetCard = ticketRefs.current[ticketId];

      if (!targetCard) {
        const msg = messages.find((m) => m.ticketId === ticketId);
        const hay = `${msg?.content ?? ""}`;
        const roomMatch = hay.match(/(\d+)\s*號房/)?.[1];
        const fuzzy = tickets.find((t) => {
          if (roomMatch && t.guestRoom.includes(roomMatch)) return true;
          if (hay.includes(t.title.slice(0, 12))) return true;
          return false;
        });
        if (fuzzy) {
          targetId = fuzzy.id;
          targetCard = ticketRefs.current[fuzzy.id];
          setSelectedTicketId(fuzzy.id);
        }
      }

      if (!targetCard) {
        setAnchorMiss(true);
        setHighlightedTicketId(null);
        return;
      }

      targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedTicketId(targetId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedTicketId(null);
      }, 2000);
    },
    [messages, tickets],
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!onSendMessage || !draft.trim()) return;
    setSending(true);
    try {
      await onSendMessage(draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-slate-800 shadow-[var(--shadow-glog-card)]">
      {/* 左欄 20%：部門 + 員工 */}
      <aside className="flex w-[20%] min-w-[200px] flex-col border-r border-slate-200/80 bg-slate-50/80">
        <div className="border-b border-slate-200/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            glog 營運中控台
          </p>
          <h2 className="mt-0.5 truncate text-sm font-bold text-slate-900">
            {hotelName}
          </h2>
        </div>
        <div className="scrollbar-none flex flex-row flex-nowrap gap-1.5 overflow-x-auto border-b border-slate-200/80 px-2 pb-2 pt-2">
          {DEPT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDeptTab(tab.id)}
              className={`shrink-0 whitespace-nowrap ${
                deptTab === tab.id ? "glog-filter-active" : "glog-filter"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-400">
              {loading ? "載入中…" : "尚無已綁定 LINE 的員工"}
            </p>
          )}
          {filteredThreads.map((t) => {
            const active = t.staff.id === selectedStaffId;
            return (
              <button
                key={t.staff.id}
                type="button"
                onClick={() => onSelectStaff(t.staff.id)}
                className={`flex w-full items-start gap-2 border-b border-slate-100 px-3 py-3 text-left transition ${
                  active
                    ? "bg-blue-50/90 ring-inset ring-1 ring-blue-100"
                    : "hover:bg-white"
                }`}
              >
                <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {t.staff.name.slice(0, 1)}
                  {t.unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-slate-50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {t.staff.name}
                    </span>
                    {t.lastMessage && (
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatTime(t.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {DEPARTMENT_LABELS[roleToDept(t.staff.role)]}
                    {t.staff.status === "BUSY" ? " · 忙碌" : ""}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t.lastMessage?.content || "尚無對話"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 中欄 50%：對話 */}
      <section className="flex w-[50%] min-w-0 flex-col bg-white">
        <header className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          {selectedThread ? (
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {selectedThread.staff.name}
              </h3>
              <p className="text-xs text-slate-500">
                {DEPARTMENT_LABELS[roleToDept(selectedThread.staff.role)]} ·{" "}
                {selectedThread.staff.status === "BUSY" ? "忙碌" : "閒置"}
                {selectedThread.staff.lineUserId
                  ? " · LINE 已綁定"
                  : " · 未綁定 LINE"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">請從左側選擇員工</p>
          )}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-glog-bg)]/40 px-4 py-4">
          {!selectedStaffId && (
            <p className="py-16 text-center text-sm text-slate-400">
              選擇員工後可檢視 LINE 推播與接單紀錄
            </p>
          )}
          {selectedStaffId && messages.length === 0 && !loading && (
            <p className="py-16 text-center text-sm text-slate-400">
              尚無訊息。當系統推播工單字卡或員工點接單後會出現在此。
            </p>
          )}
          {messages.map((msg) => {
            if (msg.sender === "system") {
              return (
                <div key={msg.id} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (msg.ticketId) handleAnchorClick(msg.ticketId);
                    }}
                    className="max-w-[85%] rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-center text-xs text-slate-600 shadow-sm transition hover:border-blue-300 hover:ring-2 hover:ring-blue-100"
                  >
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                    {msg.ticketId && (
                      <span className="mt-1.5 flex items-center justify-center gap-1 text-[10px] font-semibold text-blue-600">
                        工單錨點
                        <span aria-hidden>🔗</span>
                      </span>
                    )}
                  </button>
                </div>
              );
            }

            const isManager = msg.sender === "manager";
            return (
              <div
                key={msg.id}
                className={`flex ${isManager ? "justify-end" : "justify-start"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (msg.ticketId) handleAnchorClick(msg.ticketId);
                  }}
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm transition ${
                    isManager
                      ? "rounded-br-md bg-blue-600 text-white hover:bg-blue-700"
                      : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800 hover:border-blue-200 hover:ring-2 hover:ring-blue-100"
                  }`}
                >
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                  <span
                    className={`mt-1 flex items-center gap-2 text-[10px] ${
                      isManager ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    <span>{formatTime(msg.createdAt)}</span>
                    {msg.ticketId && (
                      <span
                        className={`inline-flex items-center gap-0.5 font-semibold ${
                          isManager ? "text-white" : "text-blue-600"
                        }`}
                      >
                        🔗 工單錨點
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => void handleSend(e)}
          className="flex gap-2 border-t border-slate-200/80 bg-white p-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!selectedStaffId || !onSendMessage}
            placeholder={
              selectedStaffId
                ? "輸入訊息給此員工（目前僅寫入中控台紀錄）…"
                : "請先選擇員工"
            }
            className="glog-input flex-1"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || !selectedStaffId}
            className="glog-btn-primary disabled:opacity-40"
          >
            送出
          </button>
        </form>
      </section>

      {/* 右欄 30%：工單上下文 */}
      <aside className="flex w-[30%] min-w-[240px] flex-col border-l border-slate-200/80 bg-slate-50/50">
        <div className="border-b border-slate-200/80 bg-white px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">工單上下文</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {anchorMiss
              ? "找不到對應卡片（可能已結案或不在待處理列表）"
              : highlightedTicketId || selectedTicketId
                ? "已對齊對話中的工單錨點"
                : "顯示此員工部門待處理／進行中工單"}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {!selectedStaffId && (
            <p className="py-10 text-center text-xs text-slate-400">
              選擇員工以載入工單
            </p>
          )}
          {selectedStaffId && tickets.length === 0 && (
            <p className="py-10 text-center text-xs text-slate-400">
              目前沒有待處理工單
            </p>
          )}
          {tickets.map((ticket) => {
            const focused = selectedTicketId === ticket.id;
            const flash = highlightedTicketId === ticket.id;
            const pending = ticket.status === "PENDING";
            const isUrgent =
              ticket.urgency === "HIGH" || ticket.urgency === "CRITICAL";
            const showNote = hasExtraNote(
              ticket.description,
              ticket.title,
              ticket.guestRoom,
            );
            const displayTitle = simplifyTicketTitle(
              ticket.title,
              ticket.guestRoom,
            );

            let cardClass =
              "rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-300";
            if (flash) {
              cardClass +=
                " animate-pulse border-blue-500/50 bg-blue-50/50 ring-2 ring-blue-500";
            } else if (focused) {
              cardClass += " border-blue-300 bg-blue-50/30 ring-1 ring-blue-300";
            } else if (isUrgent) {
              cardClass +=
                ticket.urgency === "CRITICAL"
                  ? " border-red-300 ring-1 ring-red-200"
                  : " border-amber-300 ring-1 ring-amber-200";
            }

            return (
              <article
                key={ticket.id}
                ref={(el) => {
                  ticketRefs.current[ticket.id] = el;
                }}
                className={cardClass}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                      {formatRoomLabel(ticket.guestRoom)}
                    </p>
                    <h4 className="mt-0.5 text-sm font-semibold text-slate-900">
                      {displayTitle}
                    </h4>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                      pending
                        ? "bg-amber-100 text-amber-800"
                        : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {pending ? "待處理" : "進行中"}
                  </span>
                </div>
                {showNote ? (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                    {ticket.description}
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {ticket.acceptedAt
                      ? `承接 ${formatTime(ticket.acceptedAt)}`
                      : `建立 ${formatTime(ticket.createdAt)}`}
                    {" · "}
                    {ticket.createdByName}
                  </p>
                )}
                {showNote && (
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                    <span>
                      {ticket.acceptedAt
                        ? `承接 ${formatTime(ticket.acceptedAt)}`
                        : `建立 ${formatTime(ticket.createdAt)}`}
                    </span>
                    <span>{ticket.createdByName}</span>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      alert(`變更狀態（預留）：${ticket.id}`)
                    }
                    className="glog-btn-secondary flex-1 !px-2 !py-1.5 !text-[11px]"
                  >
                    變更狀態
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      alert(`指派他人（預留）：${ticket.id}`)
                    }
                    className="glog-btn-primary flex-1 !px-2 !py-1.5 !text-[11px]"
                  >
                    指派他人
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
