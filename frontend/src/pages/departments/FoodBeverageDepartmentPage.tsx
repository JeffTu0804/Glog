import { useEffect, useMemo, useState } from "react";
import { CreateRestaurantRequestModal } from "../../components/CreateRestaurantRequestModal";
import { ROLE_LABELS } from "../../components/TicketBadges";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import {
  RESTAURANT_STATUS_LABELS,
  isRestaurantRequest,
} from "../../lib/serviceRequest";
import type { ServiceRequest, UserRole } from "../../types/api";

const HANDLE_ROLES: UserRole[] = ["ADMIN", "FOOD_BEVERAGE"];
const CREATE_ROLES: UserRole[] = ["ADMIN", "FRONT_DESK", "HOUSEKEEPING"];

export function FoodBeverageDepartmentPage() {
  const { profile, getToken } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const canHandle = profile && HANDLE_ROLES.includes(profile.role);
  const canCreate = profile && CREATE_ROLES.includes(profile.role);

  const restaurantRequests = useMemo(
    () => requests.filter((r) => isRestaurantRequest(r)),
    [requests],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { requests: list } = await api.getServiceRequests(token, "inbox", "FOOD_BEVERAGE");
      setRequests(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [getToken]);

  async function handleConfirm(id: string) {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.confirmServiceRequest(token, id, responseNote.trim() || undefined);
      setHandlingId(null);
      setResponseNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "確認失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(id: string) {
    if (!responseNote.trim()) {
      setError("請填寫無法受理原因（例：人數已額滿、預約時段非營業時間）");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      await api.rejectServiceRequest(token, id, responseNote);
      setHandlingId(null);
      setResponseNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="餐飲部"
        subtitle="餐廳預約確認 — 前台送來的預約請求，確認後系統會提醒前台通知客人"
        accent="amber"
        action={
          canCreate ? (
            <button type="button" onClick={() => setShowCreate(true)} className="glog-btn-primary">
              + 餐廳預約
            </button>
          ) : undefined
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : restaurantRequests.length === 0 ? (
        <EmptyState message="目前沒有待處理的餐廳預約" />
      ) : (
        <div className="space-y-3">
          {restaurantRequests.map((req) => (
            <article key={req.id} className="glog-card border border-amber-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">{req.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {req.guestRoom} 號房 · {req.guestName}
                  </p>
                  {req.description && (
                    <p className="mt-1 text-sm text-slate-500">{req.description}</p>
                  )}
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  {RESTAURANT_STATUS_LABELS[req.status]}
                </span>
              </div>

              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">預約時間</dt>
                  <dd className="font-medium">
                    {new Date(req.scheduledAt).toLocaleString("zh-TW")}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">建立人</dt>
                  <dd>
                    {req.createdBy.name}（{ROLE_LABELS[req.createdBy.role]})
                  </dd>
                </div>
              </dl>

              {canHandle && req.status === "PENDING" && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {handlingId === req.id ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        補充事項
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          確認預約選填；無法受理時請填寫原因
                        </span>
                      </label>
                      <textarea
                        value={responseNote}
                        onChange={(e) => setResponseNote(e.target.value)}
                        rows={2}
                        placeholder="例：桌號 A3、需兒童椅；或拒絕原因：人數已額滿、預約時段非營業時間"
                        className="glog-input resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleConfirm(req.id)}
                          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          確認預約
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleReject(req.id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        >
                          無法受理
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHandlingId(null);
                            setResponseNote("");
                          }}
                          className="text-sm text-slate-500"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setHandlingId(req.id)}
                      className="glog-btn-primary"
                    >
                      處理此預約
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <CreateRestaurantRequestModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
