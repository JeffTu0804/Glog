import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Asset, TicketPriority } from "../types/api";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const SKILL_OPTIONS = ["plumbing", "electrical", "hvac", "carpentry"];

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
  const [quickCode, setQuickCode] = useState("");
  const [quickName, setQuickName] = useState("");
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [seedingAssets, setSeedingAssets] = useState(false);

  const isAdmin = profile?.role === "ADMIN";

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

  async function handleQuickCreateAsset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreatingAsset(true);
    try {
      const token = await getToken();
      const { asset } = await api.createAsset(token, {
        code: quickCode.trim(),
        name: quickName.trim(),
        type: "ROOM",
      });
      setQuickCode("");
      setQuickName("");
      await loadAssets();
      setAssetId(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增地點失敗");
    } finally {
      setCreatingAsset(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetId) {
      setError("請先選擇或新增地點");
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
        requiredSkills: skills.length > 0 ? skills : undefined,
      });
      onCreated();
      onClose();
      setTitle("");
      setDescription("");
      setSkills([]);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">建立報修工單</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">地點</label>
            {loadingAssets ? (
              <p className="text-sm text-slate-500">載入地點中…</p>
            ) : assets.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  尚無地點可選。請先建立客房清單，才能建立工單。
                </p>
                {isAdmin ? (
                  <div className="mt-3 space-y-3">
                    <button
                      type="button"
                      disabled={seedingAssets}
                      onClick={() => void handleSeedStarterAssets()}
                      className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {seedingAssets
                        ? "載入中…"
                        : "一鍵載入 10 層客房（共 100 間）"}
                    </button>
                    <p className="text-center text-xs text-amber-800">或手動新增單一地點</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={quickCode}
                        onChange={(e) => setQuickCode(e.target.value)}
                        placeholder="代碼（例：203）"
                        required
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        placeholder="名稱（例：203 號房）"
                        required
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={creatingAsset}
                      onClick={(e) => void handleQuickCreateAsset(e)}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {creatingAsset ? "新增中…" : "快速新增地點"}
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/assets"
                    className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline"
                  >
                    前往地點管理 →
                  </Link>
                )}
              </div>
            ) : (
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} 號房（{a.location}）
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">標題</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="例：101 房水龍頭漏水"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">優先級</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="LOW">低</option>
              <option value="MEDIUM">中</option>
              <option value="HIGH">高</option>
              <option value="URGENT">緊急</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              所需技能（自動派單用）
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    skills.includes(skill)
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !assetId}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "建立中…" : "建立工單"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
