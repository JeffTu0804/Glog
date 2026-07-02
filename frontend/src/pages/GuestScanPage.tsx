import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GUEST_REQUEST_OPTIONS,
  fetchGuestRoomInfo,
  submitGuestRequest,
} from "../lib/guestApi";

export function GuestScanPage() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";

  const [roomInfo, setRoomInfo] = useState<{
    room_id: string;
    room_number: string;
    hotel_id: string;
    hotel_name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!token) {
      setError("無效的 QR Code 連結");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const info = await fetchGuestRoomInfo(token);
        setRoomInfo(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSubmit(requestType: string) {
    if (!roomInfo) return;
    setSubmitting(requestType);
    setError("");
    setSuccess("");
    try {
      await submitGuestRequest({
        hotel_id: roomInfo.hotel_id,
        room_id: roomInfo.room_id,
        request_type: requestType,
        notes: notes.trim() || undefined,
      });
      setSuccess("已送出請求，服務人員將儘快為您處理。");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        載入中…
      </div>
    );
  }

  if (!roomInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
        <p className="text-red-600">{error || "找不到房間資訊"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-indigo-600">glog 客房服務</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{roomInfo.hotel_name}</h1>
          <p className="mt-2 text-lg text-slate-600">{roomInfo.room_number} 號房</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="mb-4 text-sm text-slate-500">請選擇您需要的服務</p>

          <div className="grid grid-cols-2 gap-3">
            {GUEST_REQUEST_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                disabled={submitting !== null}
                onClick={() => void handleSubmit(opt.type)}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-800 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                <span className="text-2xl">{opt.icon}</span>
                {submitting === opt.type ? "送出中…" : opt.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="text-xs text-slate-500">補充說明（選填）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="例：需要兩條大毛巾"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {success && (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          無需登入 · 請求將送至飯店對應部門
        </p>
      </div>
    </div>
  );
}
