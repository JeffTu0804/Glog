import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Asset, TicketPriority } from "../types/api";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  ISSUE_TEMPLATES,
  PRIORITY_OPTIONS,
  SKILL_OPTIONS,
  buildTicketTitle,
  groupAssetsByFloor,
} from "../lib/engineeringTickets";

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTicketModal({ open, onClose, onCreated }: CreateTicketModalProps) {
  const { getToken, profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [skills, setSkills] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [seedingAssets, setSeedingAssets] = useState(false);

  const isAdmin = profile?.role === "ADMIN";
  const selectedAsset = assets.find((a) => a.id === assetId);
  const grouped = useMemo(() => groupAssetsByFloor(assets), [assets]);

  async function loadAssets() {
    setLoadingAssets(true);
    try {
      const token = await getToken();
      const { assets: list } = await api.getAssets(token);
      setAssets(list);
      if (list[0] && !list.some((a) => a.id === assetId)) {
        setAssetId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入地點失敗");
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    void loadAssets();
  }, [open, getToken]);

  if (!open) return null;

  function applyTemplate(template: (typeof ISSUE_TEMPLATES)[number]) {
    setSkills(template.skills);
    setPriority(template.priority);
    setDescription(template.description ?? "");
    const code = selectedAsset?.code ?? "";
    setTitle(code ? buildTicketTitle(code, template.title) : template.title);
  }

  function handleAssetChange(id: string) {
    setAssetId(id);
    const asset = assets.find((a) => a.id === id);
    if (asset && title) {
      const issuePart = title.replace(/^\d+\s*號房\s*/, "");
      setTitle(buildTicketTitle(asset.code, issuePart || "報修"));
    }
  }

  async function handleSeedStarterAssets() {
    setError("");
    setSeedingAssets(true);
    try {
      const token = await getToken();
      const { assets: list } = await api.seedStarterAssets(token);
      setAssets(list);
      if (list[0]) setAssetId(list[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入客房失敗");
    } finally {
      setSeedingAssets(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetId) {
      setError("請先選擇報修地點");
      return;
    }
    if (skills.length === 0) {
      setError("請至少選擇一項工程技能，以便自動派給工程部");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const token = await getToken();
      await api.createTicket(token, {
        assetId,
        title,
        description: description || undefined,
        priority,
        requiredSkills: skills,
      });
      onCreated();
      onClose();
      setTitle("");
      setDescription("");
      setSkills([]);
      setPriority("MEDIUM");
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSkill(skill: string) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div className="glog-card max-h-[92vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">建立工程維修單</h2>
          <p className="mt-1 text-sm text-slate-500">
            送出後將依技能自動派給工程部，或待管理員手動派工
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">報修地點</label>
            {loadingAssets ? (
              <p className="text-sm text-slate-500">載入地點中…</p>
            ) : assets.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">尚無地點可選，請先建立客房清單</p>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={seedingAssets}
                    onClick={() => void handleSeedStarterAssets()}
                    className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
                  >
                    {seedingAssets ? "載入中…" : "一鍵載入 100 間客房"}
                  </button>
                )}
                {!isAdmin && (
                  <Link to="/assets" className="mt-2 block text-sm text-indigo-600">
                    前往地點管理 →
                  </Link>
                )}
              </div>
            ) : (
              <select
                value={assetId}
                onChange={(e) => handleAssetChange(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {grouped.floors.map(([floor, rooms]) => (
                  <optgroup key={floor} label={`${floor} 樓層`}>
                    {rooms.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} 號房</option>
                    ))}
                  </optgroup>
                ))}
                {grouped.others.length > 0 && (
                  <optgroup label="設備 / 公共區域">
                    {grouped.others.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">常見問題（快選）</label>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-indigo-100 hover:text-indigo-800"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">問題摘要</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="例：305 號房水龍頭漏水"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">詳細描述（給工程師）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="症狀、發生時間、是否影響入住…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">緊急程度</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label} — {opt.hint}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              所需技能 <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-slate-500">系統會自動派給閒置且技能符合的工程師</p>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    skills.includes(skill.id)
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {skill.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !assetId}
              className="glog-btn-primary disabled:opacity-50"
            >
              {submitting ? "派送中…" : "送至工程部"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
