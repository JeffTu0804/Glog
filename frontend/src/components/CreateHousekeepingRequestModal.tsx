import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { groupAssetsByFloor } from "../lib/engineeringTickets";
import { localDatetimeToIso } from "../lib/serviceRequest";
import type { Asset } from "../types/api";

const TASK_TEMPLATES = [
  { label: "備品補送", title: "備品補送", description: "請補送枕頭、毛巾或盥洗用品" },
  { label: "客房清潔", title: "客房清潔", description: "請安排客房清潔" },
  { label: "整理房間", title: "整理房間", description: "請協助整理客房" },
  { label: "加床", title: "加床", description: "請協助加床" },
];

function defaultSoonLocal(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CreateHousekeepingRequestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateHousekeepingRequestModal({
  open,
  onClose,
  onCreated,
}: CreateHousekeepingRequestModalProps) {
  const { getToken } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [guestRoom, setGuestRoom] = useState("");
  const [guestName, setGuestName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultSoonLocal);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const grouped = useMemo(() => groupAssetsByFloor(assets), [assets]);
  const selectedAsset = assets.find((a) => a.id === assetId);

  useEffect(() => {
    if (!open) return;
    setError("");
    async function loadAssets() {
      setLoadingAssets(true);
      try {
        const token = await getToken();
        const { assets: list } = await api.getAssets(token);
        setAssets(list);
        if (list[0]) {
          setAssetId(list[0].id);
          setGuestRoom(list[0].code);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入地點失敗");
      } finally {
        setLoadingAssets(false);
      }
    }
    void loadAssets();
  }, [open, getToken]);

  if (!open) return null;

  function handleAssetChange(id: string) {
    setAssetId(id);
    const asset = assets.find((a) => a.id === id);
    if (asset) setGuestRoom(asset.code);
  }

  function applyTemplate(template: (typeof TASK_TEMPLATES)[number]) {
    setTitle(template.title);
    setDescription(template.description);
    if (selectedAsset) {
      setTitle(`${selectedAsset.code} 號房 ${template.title}`);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.createServiceRequest(token, {
        type: "GENERAL",
        title,
        description: description || undefined,
        guestRoom,
        guestName,
        targetDepartment: "HOUSEKEEPING",
        scheduledAt: localDatetimeToIso(scheduledAt),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
      <div className="glog-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <h2 className="text-lg font-semibold">建立房務請求</h2>
        <p className="mt-1 text-sm text-slate-500">送出後將通知房務部接單，5 分鐘內須有人認領</p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">房號</label>
            {loadingAssets ? (
              <p className="text-sm text-slate-500">載入地點中…</p>
            ) : (
              <select
                value={assetId}
                onChange={(e) => handleAssetChange(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                {grouped.floors.map(([floor, rooms]) => (
                  <optgroup key={floor} label={`${floor} 樓層`}>
                    {rooms.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} 號房 · {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {grouped.others.length > 0 && (
                  <optgroup label="其他地點">
                    {grouped.others.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">常見請求（快選）</label>
            <div className="flex flex-wrap gap-2">
              {TASK_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <FormField
            label="請求標題"
            value={title}
            onChange={setTitle}
            required
            placeholder="例：305 號房備品補送"
          />
          <FormField
            label="客人姓名"
            value={guestName}
            onChange={setGuestName}
            required
            placeholder="例：王小姐"
          />
          <div>
            <label className="mb-1 block text-sm font-medium">詳細說明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="需要補送的品項、清潔範圍等"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">希望處理時間</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600">
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="glog-btn-primary disabled:opacity-50"
            >
              {submitting ? "送出中…" : "送至房務部"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
    </div>
  );
}
