import { useEffect, useMemo, useState } from "react";
import { CreateHousekeepingRequestModal } from "../../components/CreateHousekeepingRequestModal";
import { DepartmentTaskCard } from "../../components/DepartmentTaskCard";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { FilterChip } from "../../components/ui/FilterChip";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { fileToOptionalPhotoPayload } from "../../lib/photoUpload";
import { isDepartmentTask } from "../../lib/serviceRequest";
import type { ServiceRequest, UserRole } from "../../types/api";

type View = "inbox" | "active" | "all";

const HANDLE_ROLES: UserRole[] = ["ADMIN", "HOUSEKEEPING"];
const CREATE_ROLES: UserRole[] = ["ADMIN", "FRONT_DESK", "HOUSEKEEPING"];

export function HousekeepingDepartmentPage() {
  const { profile, getToken } = useAuth();
  const [view, setView] = useState<View>("inbox");
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [completeNote, setCompleteNote] = useState("");
  const [completePhotos, setCompletePhotos] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const canHandle = profile && HANDLE_ROLES.includes(profile.role);
  const canCreate = profile && CREATE_ROLES.includes(profile.role);

  const filtered = useMemo(
    () =>
      requests.filter(
        (r) => isDepartmentTask(r) && r.targetDepartment === "HOUSEKEEPING",
      ),
    [requests],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const apiView = view === "all" ? "all" : view;
      const { requests: list } = await api.getServiceRequests(token, apiView, "HOUSEKEEPING");
      setRequests(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [view, getToken]);

  async function handleAccept(id: string) {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.acceptServiceRequest(token, id);
      setView("active");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "接單失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: string) {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      const photo = await fileToOptionalPhotoPayload(completePhotos);
      await api.completeServiceRequest(token, id, {
        note: completeNote.trim() || "已完成",
        ...(photo ? { photo } : {}),
      });
      setHandlingId(null);
      setCompleteNote("");
      setCompletePhotos(null);
      setView("inbox");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "結案失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { v: View; label: string }[] = [
    { v: "inbox", label: "待接單" },
    ...(canHandle ? [{ v: "active" as const, label: "進行中" }] : []),
    { v: "all", label: "全部紀錄" },
  ];

  return (
    <div>
      <PageHeader
        title="房務部"
        subtitle="備品補送、清潔請求 — 接單後可選填完成照片結案，5 分鐘內須有人接單"
        accent="emerald"
        action={
          canCreate ? (
            <button type="button" onClick={() => setShowCreate(true)} className="glog-btn-primary">
              + 房務請求
            </button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <FilterChip
            key={tab.v}
            label={tab.label}
            active={view === tab.v}
            onClick={() => setView(tab.v)}
          />
        ))}
      </div>

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            view === "inbox"
              ? "目前沒有待接單的房務任務"
              : view === "active"
                ? "沒有進行中的任務"
                : "尚無房務任務紀錄"
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => (
            <DepartmentTaskCard
              key={req.id}
              req={req}
              view={view}
              profileId={profile?.id}
              canHandle={!!canHandle}
              photoOptional
              handlingId={handlingId}
              submitting={submitting}
              completeNote={completeNote}
              onSetHandlingId={setHandlingId}
              onCompleteNoteChange={setCompleteNote}
              onCompletePhotosChange={setCompletePhotos}
              onAccept={() => void handleAccept(req.id)}
              onComplete={() => void handleComplete(req.id)}
            />
          ))}
        </div>
      )}

      <CreateHousekeepingRequestModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
