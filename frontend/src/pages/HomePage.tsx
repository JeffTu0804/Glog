import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ActiveMemoCards } from "../components/ActiveMemoCards";
import { AlertBanner } from "../components/ui/AlertBanner";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { DEPARTMENT_LABELS } from "../lib/department";
import type {
  HandoverAckItem,
  HandoverItemType,
  HomeResponse,
  HomeTodoItem,
} from "../types/api";

const TODO_KIND_LABELS: Record<HomeTodoItem["kind"], string> = {
  guest_request: "客人請求",
  service_request: "部門任務",
  maintenance_ticket: "工程工單",
  reminder: "提醒",
};

/**
 * 主管今日營運異狀 — Mock 數據
 * TODO: 串接後端 api.getHomeOpsStats(token) 或 Supabase count：
 *   - pendingAccept: tickets/service_requests where status pending + hotel_id
 *   - overdueSla: reminders title startsWith [接單SLA] TRIGGERED
 *   - completedToday: completed count where updated_at >= today Asia/Taipei
 */
const ADMIN_OPS_MOCK = {
  pendingAccept: 3,
  overdueSla: 1,
  completedToday: 12,
};

export function HomePage() {
  const { profile, getToken } = useAuth();
  const outlet = useOutletContext<{ eventTick?: number } | null>();
  const isAdmin = profile?.role === "ADMIN";
  const [data, setData] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const home = await api.getHome(token);
      setData(home);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load, outlet?.eventTick]);

  async function handleToggleAck(
    logbookId: string,
    itemType: HandoverItemType,
    itemIndex: number,
    completed: boolean,
  ) {
    const key = `${itemType}-${itemIndex}`;
    setTogglingKey(key);
    setError("");
    try {
      const token = await getToken();
      const { handoverAcks } = await api.toggleHandoverAck(token, {
        logbookId,
        itemType,
        itemIndex,
        completed,
      });
      setData((prev) => (prev ? { ...prev, handoverAcks } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setTogglingKey(null);
    }
  }

  if (loading) {
    return <p className="text-slate-500">載入中…</p>;
  }

  const handover = data?.previousHandover;
  const ackSet = new Set(
    (data?.handoverAcks ?? []).map((a) => `${a.itemType}-${a.itemIndex}`),
  );
  const ackMap = new Map(
    (data?.handoverAcks ?? []).map((a) => [`${a.itemType}-${a.itemIndex}`, a]),
  );

  const pendingHandoverCount =
    handover == null
      ? 0
      : handover.highlights.length +
        handover.openItems.length -
        (data?.handoverAcks.length ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`歡迎回來，${profile?.name ?? ""}`}
        subtitle={
          data?.shift
            ? `目前班別 ${data.shift.label}（${data.shift.window}）· ${DEPARTMENT_LABELS[data.department]}`
            : "今日工作總覽"
        }
        accent="blue"
        meta={
          isAdmin ? (
            <AdminOpsPills stats={ADMIN_OPS_MOCK} />
          ) : undefined
        }
        action={
          isAdmin ? (
            <Link to="/logbook" className="glog-btn-secondary text-sm">
              交班紀錄 →
            </Link>
          ) : undefined
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      {(data?.activeMemos?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            目前館內公告
          </h2>
          <ActiveMemoCards
            memos={data!.activeMemos!}
            onDismissed={() => void load()}
          />
        </section>
      )}

      <div
        className={
          isAdmin ? "grid gap-6 lg:grid-cols-5" : "grid gap-6"
        }
      >
        <section
          className={`glog-card p-6 ${isAdmin ? "lg:col-span-3" : "w-full"}`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {isAdmin ? "待辦事項" : "今日任務清單"}
            </h2>
            {(data?.todos.length ?? 0) > 0 && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {data!.todos.length} 項
              </span>
            )}
          </div>

          {!data?.todos.length ? (
            <EmptyState message="目前沒有待完成事項，辛苦了！" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} emphasize={isAdmin ? false : true} />
              ))}
            </ul>
          )}
        </section>

        {isAdmin && (
          <section className="glog-card p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">上一班重點</h2>
              {handover && pendingHandoverCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  {pendingHandoverCount} 待確認
                </span>
              )}
            </div>

            {!handover ? (
              <EmptyState message="尚無上一班交班紀錄" />
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  {handover.shiftLabel} · {handover.shiftDate}
                  {handover.publishedBy && ` · ${handover.publishedBy.name} 交班`}
                </p>

                {handover.highlights.length > 0 && (
                  <HandoverItemList
                    label="重點"
                    items={handover.highlights}
                    itemType="HIGHLIGHT"
                    logbookId={handover.id}
                    ackSet={ackSet}
                    ackMap={ackMap}
                    togglingKey={togglingKey}
                    onToggle={handleToggleAck}
                  />
                )}

                {handover.openItems.length > 0 && (
                  <HandoverItemList
                    label="待追蹤"
                    items={handover.openItems}
                    itemType="OPEN_ITEM"
                    logbookId={handover.id}
                    ackSet={ackSet}
                    ackMap={ackMap}
                    togglingKey={togglingKey}
                    onToggle={handleToggleAck}
                    variant="amber"
                  />
                )}

                {handover.highlights.length === 0 &&
                  handover.openItems.length === 0 && (
                    <p className="text-sm text-slate-500">此班次無特別重點事項</p>
                  )}

                <Link
                  to="/logbook"
                  className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  查看完整交班紀錄 →
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function AdminOpsPills({
  stats,
}: {
  stats: {
    pendingAccept: number;
    overdueSla: number;
    completedToday: number;
  };
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80">
        <span aria-hidden>⏳</span>
        待接單：
        <span className="font-bold text-slate-800">{stats.pendingAccept}</span> 案
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200/80">
        <span aria-hidden>🚨</span>
        逾期 SLA：
        <span className="font-bold text-rose-600">{stats.overdueSla}</span> 案
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200/70">
        <span aria-hidden>✅</span>
        今日已結案：
        <span className="font-bold text-emerald-600">{stats.completedToday}</span>{" "}
        案
      </span>
    </div>
  );
}

function resolveRoomNumber(todo: HomeTodoItem): string | null {
  if (todo.roomNumber?.trim()) return todo.roomNumber.trim();
  const fromTitle = todo.title.match(/(\d+)\s*號房/);
  if (fromTitle?.[1]) return fromTitle[1];
  const fromSub = todo.subtitle.match(/(\d+)\s*號房/);
  if (fromSub?.[1]) return fromSub[1];
  const code = todo.subtitle.match(/^(\d{3,4})\b/);
  return code?.[1] ?? null;
}

function resolveTodoStatus(
  todo: HomeTodoItem,
): "pending" | "in_progress" | null {
  if (todo.todoStatus) return todo.todoStatus;
  const blob = `${todo.title} ${todo.subtitle}`;
  if (/進行中|處理中|待完工/.test(blob)) return "in_progress";
  if (/待處理|待接單/.test(blob)) return "pending";
  return null;
}

function cleanTodoTitle(todo: HomeTodoItem, room: string | null): string {
  let title = todo.title
    .replace(/（進行中）|\(進行中\)/g, "")
    .replace(/（待處理）|\(待處理\)/g, "")
    .trim();
  if (room) {
    title = title
      .replace(new RegExp(`${room}\\s*號房\\s*[·•]?\\s*`), "")
      .replace(new RegExp(`^${room}\\s*[·•]\\s*`), "")
      .trim();
  }
  return title || todo.title;
}

function TodoRow({
  todo,
  emphasize,
}: {
  todo: HomeTodoItem;
  emphasize?: boolean;
}) {
  const room = resolveRoomNumber(todo);
  const status = resolveTodoStatus(todo);
  const title = cleanTodoTitle(todo, room);

  return (
    <li>
      <Link
        to={todo.href}
        className={`flex items-center justify-between gap-3 rounded-xl px-2 transition hover:bg-slate-50/80 -mx-2 ${
          emphasize ? "py-4" : "py-3.5"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {room && (
            <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-base font-bold text-slate-800">
              {room}號房
            </span>
          )}
          <div className="min-w-0">
            <p
              className={`truncate font-medium text-slate-900 ${
                emphasize ? "text-base" : "text-sm"
              }`}
            >
              {title}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {TODO_KIND_LABELS[todo.kind]}
              {todo.subtitle ? ` · ${todo.subtitle}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === "in_progress" && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 ring-1 ring-inset ring-blue-100">
              進行中
            </span>
          )}
          {status === "pending" && (
            <span className="rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 ring-1 ring-inset ring-yellow-100">
              待處理
            </span>
          )}
          <span className="hidden text-xs text-slate-400 sm:inline">
            {new Date(todo.createdAt).toLocaleString("zh-TW", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </Link>
    </li>
  );
}

function HandoverItemList({
  label,
  items,
  itemType,
  logbookId,
  ackSet,
  ackMap,
  togglingKey,
  onToggle,
  variant = "default",
}: {
  label: string;
  items: string[];
  itemType: HandoverItemType;
  logbookId: string;
  ackSet: Set<string>;
  ackMap: Map<string, HandoverAckItem>;
  togglingKey: string | null;
  onToggle: (
    logbookId: string,
    itemType: HandoverItemType,
    itemIndex: number,
    completed: boolean,
  ) => void;
  variant?: "default" | "amber";
}) {
  const boxClass =
    variant === "amber"
      ? "rounded-xl border border-amber-200 bg-amber-50/60 p-3"
      : "";

  return (
    <div className={boxClass}>
      <p
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
          variant === "amber" ? "text-amber-800" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <ul className="space-y-2">
        {items.map((text, index) => {
          const key = `${itemType}-${index}`;
          const checked = ackSet.has(key);
          const ack = ackMap.get(key);
          const busy = togglingKey === key;

          return (
            <li key={key}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg p-2 transition ${
                  checked ? "bg-emerald-50/80" : "hover:bg-white/60"
                } ${busy ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={(e) =>
                    void onToggle(logbookId, itemType, index, e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span
                  className={`text-sm leading-relaxed ${
                    checked ? "text-slate-500 line-through" : "text-slate-800"
                  }`}
                >
                  {text}
                </span>
              </label>
              {checked && ack && (
                <p className="ml-7 text-xs text-emerald-600">
                  {ack.completedBy.name} 已確認 ·{" "}
                  {new Date(ack.completedAt).toLocaleString("zh-TW", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
