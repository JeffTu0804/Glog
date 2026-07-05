import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

export function HomePage() {
  const { profile, getToken } = useAuth();
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
  }, [load]);

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
        action={
          <Link to="/logbook" className="glog-btn-secondary text-sm">
            交班紀錄 →
          </Link>
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="glog-card p-6 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">待辦事項</h2>
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
                <TodoRow key={todo.id} todo={todo} />
              ))}
            </ul>
          )}
        </section>

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

              {handover.highlights.length === 0 && handover.openItems.length === 0 && (
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
      </div>
    </div>
  );
}

function TodoRow({ todo }: { todo: HomeTodoItem }) {
  return (
    <li>
      <Link
        to={todo.href}
        className="flex items-start justify-between gap-3 py-3.5 transition hover:bg-slate-50/80 -mx-2 px-2 rounded-xl"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{todo.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {TODO_KIND_LABELS[todo.kind]} · {todo.subtitle}
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          {new Date(todo.createdAt).toLocaleString("zh-TW", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
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
