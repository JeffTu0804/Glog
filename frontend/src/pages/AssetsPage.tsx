import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Asset, AssetStatus, AssetType } from "../types/api";

const TYPE_LABELS: Record<AssetType, string> = {
  ROOM: "客房",
  EQUIPMENT: "設備",
  FACILITY: "公共設施",
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  OPERATIONAL: "正常",
  MAINTENANCE: "維護中",
  OUT_OF_ORDER: "故障",
};

const STATUS_COLORS: Record<AssetStatus, string> = {
  OPERATIONAL: "bg-emerald-100 text-emerald-800",
  MAINTENANCE: "bg-amber-100 text-amber-800",
  OUT_OF_ORDER: "bg-red-100 text-red-800",
};

export function AssetsPage() {
  const { getToken, profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<AssetType>("ROOM");
  const [location, setLocation] = useState("");

  const isAdmin = profile?.role === "ADMIN";

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const { assets: list } = await api.getAssets(token);
      setAssets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSeedRooms() {
    try {
      const token = await getToken();
      await api.seedStarterAssets(token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入客房失敗");
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const token = await getToken();
      await api.createAsset(token, { name, code, type, location: location || undefined });
      setShowForm(false);
      setName("");
      setCode("");
      setLocation("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">地點管理</h1>
          <p className="mt-1 text-sm text-slate-500">客房與公共區域（10 層 × 每層 10 間）</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSeedRooms()}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              載入 100 間客房
            </button>
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + 新增地點
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showForm && isAdmin && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-6 rounded-xl bg-white p-5 ring-1 ring-slate-200"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="名稱（例：101 號房）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="編號（例：101）"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AssetType)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ROOM">客房</option>
              <option value="EQUIPMENT">設備</option>
              <option value="FACILITY">公共設施</option>
            </select>
            <input
              placeholder="位置（選填）"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
          >
            建立
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">編號</th>
                <th className="px-4 py-3 font-medium">名稱</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">位置</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-4 py-3 font-mono text-slate-900">{asset.code}</td>
                  <td className="px-4 py-3 text-slate-900">{asset.name}</td>
                  <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[asset.type]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[asset.status]}`}
                    >
                      {STATUS_LABELS[asset.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{asset.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
