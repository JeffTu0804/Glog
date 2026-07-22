import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { isHotelAdmin } from "../lib/hotelAdmin";
import type { InventoryItem } from "../types/api";

export function InventoryPage() {
  const { getToken, profile } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [unitCost, setUnitCost] = useState(0);

  const isAdmin = isHotelAdmin(profile);

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const { items: list } = await api.getInventory(token, {
        lowStock: showLowOnly || undefined,
      });
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [showLowOnly]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const token = await getToken();
      await api.createInventory(token, { name, sku: sku || undefined, quantity, unitCost });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">耗材庫存</h1>
          <p className="mt-1 text-sm text-slate-500">後勤備品管理</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowLowOnly(!showLowOnly)}
            className={`rounded-lg px-3 py-2 text-sm ${
              showLowOnly
                ? "bg-red-100 text-red-700"
                : "bg-white ring-1 ring-slate-200 text-slate-600"
            }`}
          >
            僅顯示低庫存
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              + 新增耗材
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showForm && isAdmin && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-6 grid gap-3 rounded-xl bg-white p-5 ring-1 ring-slate-200 sm:grid-cols-2"
        >
          <input placeholder="名稱" value={name} onChange={(e) => setName(e.target.value)} required className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="料號（選填）" value={sku} onChange={(e) => setSku(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          <input type="number" placeholder="數量" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-lg border px-3 py-2 text-sm" />
          <input type="number" placeholder="單位成本" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} required className="rounded-lg border px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white sm:col-span-2">
            建立
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isLow = item.quantity <= item.reorderLevel;
            return (
              <div
                key={item.id}
                className={`rounded-xl bg-white p-4 ring-1 ${isLow ? "ring-red-200" : "ring-slate-200"}`}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium text-slate-900">{item.name}</h3>
                  {isLow && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      低庫存
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.sku ?? "無料號"}</p>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-slate-600">
                    庫存：<strong>{item.quantity}</strong> {item.unit}
                  </span>
                  <span className="text-slate-500">NT$ {item.unitCost}/個</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
