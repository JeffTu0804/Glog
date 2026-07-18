import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { HotelNotice } from "../types/api";

function formatExpiresAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface ActiveMemoCardsProps {
  memos: HotelNotice[];
  onDismissed?: () => void;
  compact?: boolean;
}

export function ActiveMemoCards({
  memos,
  onDismissed,
  compact,
}: ActiveMemoCardsProps) {
  const { getToken } = useAuth();

  if (memos.length === 0) return null;

  async function handleDismiss(id: string) {
    try {
      const token = await getToken();
      await api.markNoticeRead(token, id);
      onDismissed?.();
    } catch {
      // ignore
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {memos.map((m) => (
        <article
          key={m.id}
          className="rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50 to-indigo-50/40 px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                  照會
                </span>
                <h3 className="text-sm font-semibold text-slate-900">{m.title}</h3>
              </div>
              {m.content && (
                <p className="text-sm text-slate-600">{m.content}</p>
              )}
              {m.expiresAt ? (
                <p className="mt-1.5 text-xs font-medium text-amber-700">
                  ⏳ 預計於 {formatExpiresAt(m.expiresAt)} 恢復/結束
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">
                  無限期 · 至手動下架前皆有效
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {m.createdBy.name} ·{" "}
                {new Date(m.createdAt).toLocaleString("zh-TW", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {onDismissed && (
              <button
                type="button"
                onClick={() => void handleDismiss(m.id)}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                下架
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
