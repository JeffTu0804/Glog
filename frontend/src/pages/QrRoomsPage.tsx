import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { qrImageUrl } from "../lib/guestApi";
import type { GuestRoom } from "../types/api";

export function QrRoomsPage() {
  const { getToken } = useAuth();
  const [rooms, setRooms] = useState<GuestRoom[]>([]);
  const [lineToken, setLineToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { rooms: list } = await api.getGuestRooms(token);
      setRooms(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [getToken]);

  async function handleSync() {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const token = await getToken();
      const result = await api.syncGuestRooms(token);
      setRooms(result.rooms);
      setSuccess(`同步完成：新增 ${result.created} 間、更新 ${result.updated} 間`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegenerate(roomId: string) {
    if (!confirm("重新產生 QR 後，舊的 QR Code 將失效，確定繼續？")) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      const { room } = await api.regenerateRoomQr(token, roomId);
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...room } : r)));
      setSuccess(`${room.roomNumber} 號房 QR 已更新`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveLineToken() {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.updateHotelLineToken(token, lineToken);
      setSuccess("LINE Token 已儲存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSubmitting(false);
    }
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url);
    setSuccess("已複製掃碼連結");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QR Code 管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            從「地點」客房同步 QR、列印或重新產生識別碼
          </p>
        </div>
        <Link
          to="/guest-requests"
          className="text-sm text-indigo-600 hover:underline"
        >
          ← 返回住客請求
        </Link>
      </div>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">飯店 LINE 推播 Token</h2>
        <p className="mt-1 text-xs text-slate-500">
          住客請求將使用此 Token 推播給部門員工（可覆蓋全域 LINE Token）
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            value={lineToken}
            onChange={(e) => setLineToken(e.target.value)}
            placeholder="line_official_token"
            className="min-w-[280px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSaveLineToken()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            儲存
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSync()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {submitting ? "處理中…" : "從地點同步客房"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      )}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
          尚無客房 QR，請先點「從地點同步客房」
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">房號</th>
                <th className="px-4 py-3">QR Token</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <Fragment key={room.id}>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">{room.roomNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {room.qrToken}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === room.id ? null : room.id)
                          }
                          className="text-indigo-600 hover:underline"
                        >
                          {expandedId === room.id ? "收起" : "顯示 QR"}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyUrl(room.scanUrl)}
                          className="text-slate-600 hover:underline"
                        >
                          複製連結
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleRegenerate(room.id)}
                          className="text-amber-700 hover:underline disabled:opacity-50"
                        >
                          重新產生
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === room.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-6">
                          <img
                            src={qrImageUrl(room.scanUrl, 160)}
                            alt={`${room.roomNumber} QR`}
                            className="rounded-lg border border-slate-200 bg-white p-2"
                            width={160}
                            height={160}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-500">掃碼網址</p>
                            <p className="mt-1 break-all text-sm text-slate-700">
                              {room.scanUrl}
                            </p>
                            <a
                              href={room.scanUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
                            >
                              預覽住客頁面
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
