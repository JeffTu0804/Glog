import { type FormEvent, useState } from "react";
import { api } from "../lib/api";
import {
  buildRoutingDecision,
  departmentToRoutingSlug,
  ROUTING_SLUG_OPTIONS,
  URGENCY_LABELS,
} from "../lib/routing";
import type { Department, RoutingDecision, RoutingUrgency } from "../types/api";

interface LogbookNoteFormProps {
  logbookId: string;
  department: Department;
  getToken: () => Promise<string>;
  onSaved: () => Promise<void>;
  onTicketAlert?: (message: string) => void;
}

export function LogbookNoteForm({
  logbookId,
  department,
  getToken,
  onSaved,
  onTicketAlert,
}: LogbookNoteFormProps) {
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"draft" | "routing">("draft");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiRouting, setAiRouting] = useState<RoutingDecision | null>(null);
  const [visibility, setVisibility] = useState<"internal" | "shared">("internal");
  const [sharedSlugs, setSharedSlugs] = useState<string[]>([]);

  const ownSlug = departmentToRoutingSlug(department);
  const otherDeptOptions = ROUTING_SLUG_OPTIONS.filter((o) => o.department !== department);

  function resetForm() {
    setNote("");
    setStep("draft");
    setAiRouting(null);
    setVisibility("internal");
    setSharedSlugs([]);
    setError("");
  }

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { routing_decision } = await api.previewLogbookRouting(
        token,
        note.trim(),
        department,
      );
      setAiRouting(routing_decision);

      const suggestedOthers = routing_decision.shared_with.filter((s) => s !== ownSlug);
      const isShared =
        routing_decision.visibility === "shared" && suggestedOthers.length > 0;

      setVisibility(isShared ? "shared" : "internal");
      setSharedSlugs(isShared ? suggestedOthers : []);
      setStep("routing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 路由分析失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!note.trim()) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const routing = buildRoutingDecision({
        visibility,
        sharedSlugs: visibility === "shared" ? sharedSlugs : [],
        reason:
          aiRouting?.reason ??
          (visibility === "shared" ? "使用者指定跨部門同步" : "僅本部門可見"),
        urgency: (aiRouting?.urgency ?? "low") as RoutingUrgency,
      });

      const result = await api.addLogbookEntry(token, logbookId, note.trim(), routing);

      if (result.ticketAlert?.message) {
        onTicketAlert?.(result.ticketAlert.message);
      }

      resetForm();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增備註失敗");
    } finally {
      setLoading(false);
    }
  }

  function toggleSharedSlug(slug: string) {
    setSharedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  if (step === "draft") {
    return (
      <form onSubmit={(e) => void handlePreview(e)} className="mt-4 space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="例：305 冷氣壞了，客人很兇，已派工；明天 10 點有團體退房"
          className="glog-input resize-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !note.trim()}
          className="glog-btn-primary w-full disabled:opacity-50"
        >
          {loading ? "AI 分析中…" : "下一步：確認可見範圍"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">備註內容</p>
        <p className="mt-1 whitespace-pre-wrap">{note}</p>
        {aiRouting && (
          <p className="mt-2 text-xs text-slate-500">
            AI 建議：{aiRouting.reason}（緊急度：{URGENCY_LABELS[aiRouting.urgency]}）
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">誰可以看到這則備註？</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="visibility"
            checked={visibility === "internal"}
            onChange={() => setVisibility("internal")}
          />
          僅本部門（{ROUTING_SLUG_OPTIONS.find((o) => o.department === department)?.label}）
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="visibility"
            checked={visibility === "shared"}
            onChange={() => setVisibility("shared")}
          />
          同步給其他部門
        </label>
      </fieldset>

      {visibility === "shared" && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-600">選擇要通知的部門</p>
          {otherDeptOptions.map((opt) => (
            <label key={opt.slug} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sharedSlugs.includes(opt.slug)}
                onChange={() => toggleSharedSlug(opt.slug)}
              />
              {opt.label}
            </label>
          ))}
          {sharedSlugs.length === 0 && (
            <p className="text-xs text-amber-600">未勾選其他部門時，將僅記錄於本部門</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleSubmit()}
          className="glog-btn-primary flex-1 disabled:opacity-50"
        >
          {loading ? "儲存中…" : "確認新增"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => setStep("draft")}
          className="glog-btn-ghost text-sm"
        >
          返回修改
        </button>
      </div>
    </div>
  );
}
