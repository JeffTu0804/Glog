import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PriorityBadge, StaleBadge, TicketStatusBadge } from "../components/TicketBadges";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { filesToPhotoPayload, uploadUrl } from "../lib/photoUpload";
import {
  formatStaleDuration,
  getStaleDurationMs,
  isTicketStale,
} from "../lib/ticketStale";
import type { InventoryItem, MaintenanceTicket, TicketStatus, User } from "../types/api";

const WORKFLOW_STEPS = [
  { status: "OPEN", label: "① 派單" },
  { status: "ASSIGNED", label: "② 開始作業" },
  { status: "IN_PROGRESS", label: "③ 現場回報" },
  { status: "COMPLETED", label: "④ 結案" },
] as const;

function workflowStepIndex(status: TicketStatus): number {
  if (status === "OPEN") return 0;
  if (status === "ASSIGNED") return 1;
  if (status === "IN_PROGRESS" || status === "PENDING_FRONT_DESK") return 2;
  if (status === "COMPLETED") return 3;
  return 4;
}

function nextStepHint(status: TicketStatus, role: string | undefined): string {
  switch (status) {
    case "OPEN":
      return "請先指派工程師。指派後，工程師點「開始作業」才能上傳現場照片。";
    case "ASSIGNED":
      return "工程師請點「開始作業」，進入現場後可拍照回報完工或申請前台協助。";
    case "IN_PROGRESS":
      return "請在下方「現場回報」上傳至少一張照片並填寫說明。";
    case "PENDING_FRONT_DESK":
      return role === "FRONT_DESK" || role === "ADMIN"
        ? "請在下方協調處理（換房、通知客人等），並記錄備註。"
        : "已通知前台協助，請等待前台處理。";
    case "COMPLETED":
      return "工程已回報完工，可進行財務結案（耗材選填）。";
    default:
      return "";
  }
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, getToken } = useAuth();
  const [ticket, setTicket] = useState<MaintenanceTicket | null>(null);
  const [engineers, setEngineers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [assignToId, setAssignToId] = useState("");
  const [selectedInventory, setSelectedInventory] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [laborCost, setLaborCost] = useState(0);

  const [reportNote, setReportNote] = useState("");
  const [reportPhotos, setReportPhotos] = useState<File[]>([]);
  const [reportType, setReportType] = useState<"COMPLETED" | "NEEDS_FRONT_DESK">("COMPLETED");
  const [frontDeskNote, setFrontDeskNote] = useState("");

  async function loadTicket() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const { ticket: data } = await api.getTicket(token, id);
      setTicket(data);

      if (profile?.role === "ADMIN" && data.status === "OPEN") {
        const { users } = await api.getUsers(token, { role: "ENGINEER" });
        setEngineers(users);
        if (users[0]) setAssignToId(users[0].id);
      }

      if (
        (profile?.role === "ENGINEER" || profile?.role === "ADMIN") &&
        (data.status === "IN_PROGRESS" || data.status === "COMPLETED")
      ) {
        const { items } = await api.getInventory(token);
        setInventory(items);
        if (items[0]) setSelectedInventory(items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTicket();
  }, [id, profile?.role]);

  async function runAction(action: () => Promise<void>) {
    setActionError("");
    setSubmitting(true);
    try {
      await action();
      setReportPhotos([]);
      setReportNote("");
      await loadTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartWork() {
    if (!id) return;
    await runAction(async () => {
      const token = await getToken();
      await api.updateTicketStatus(token, id, "IN_PROGRESS");
    });
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!id || !assignToId) return;
    await runAction(async () => {
      const token = await getToken();
      await api.assignTicket(token, id, assignToId);
    });
  }

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const needsInventory = ticket?.status === "IN_PROGRESS";
    if (needsInventory && !selectedInventory) return;

    await runAction(async () => {
      const token = await getToken();
      await api.closeTicket(token, id, {
        inventoryUsages:
          selectedInventory && quantity > 0
            ? [{ inventoryId: selectedInventory, quantity }]
            : [],
        laborCost: laborCost > 0 ? laborCost : undefined,
      });
    });
  }

  async function handleReport(e: FormEvent) {
    e.preventDefault();
    if (!id || reportPhotos.length === 0) {
      setActionError("請至少上傳一張現場照片");
      return;
    }
    await runAction(async () => {
      const token = await getToken();
      const photos = await filesToPhotoPayload(reportPhotos);
      await api.submitTicketReport(token, id, {
        type: reportType,
        note: reportNote,
        photos,
      });
    });
  }

  async function handleFrontDeskResolve(action: "RESUME" | "CLOSE") {
    if (!id) return;
    await runAction(async () => {
      const token = await getToken();
      await api.resolveFrontDeskEscalation(token, id, {
        action,
        note: frontDeskNote,
      });
    });
  }

  async function handleCancel() {
    if (!id || !confirm("確定要取消此工單？")) return;
    await runAction(async () => {
      const token = await getToken();
      await api.updateTicketStatus(token, id, "CANCELLED");
    });
  }

  if (loading) {
    return <p className="text-sm text-slate-500">載入中…</p>;
  }

  if (error || !ticket) {
    return (
      <div>
        <p className="text-red-600">{error ?? "找不到工單"}</p>
        <Link to="/tickets" className="mt-4 inline-block text-sm text-indigo-600">
          返回列表
        </Link>
      </div>
    );
  }

  const isAssignedEngineer =
    profile?.role === "ENGINEER" && ticket.assignedTo?.id === profile.id;
  const canDoEngineerActions =
    isAssignedEngineer || profile?.role === "ADMIN";
  const canManageClose = canDoEngineerActions;
  const stale = isTicketStale(ticket);
  const isFrontDesk = profile?.role === "FRONT_DESK" || profile?.role === "ADMIN";
  const stepIndex = workflowStepIndex(ticket.status);
  const hint = nextStepHint(ticket.status, profile?.role);
  const attachments = ticket.attachments ?? [];

  return (
    <div>
      <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
        ← 返回工單列表
      </Link>

      {stale && (
        <div className="mt-4 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <StaleBadge durationLabel={formatStaleDuration(getStaleDurationMs(ticket))} />
            <p className="text-sm text-red-800">
              此工單已超過 2 小時未更新狀態，請盡快處理或更新進度
            </p>
          </div>
        </div>
      )}

      {ticket.status !== "CLOSED" && ticket.status !== "CANCELLED" && (
        <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-3 ring-1 ring-indigo-100">
          <div className="flex flex-wrap items-center gap-1 text-xs font-medium">
            {WORKFLOW_STEPS.map((step, i) => (
              <span key={step.status} className="inline-flex items-center gap-1">
                <span
                  className={
                    i <= stepIndex && stepIndex < 4
                      ? "text-indigo-700"
                      : "text-slate-400"
                  }
                >
                  {step.label}
                </span>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span className="text-slate-300">→</span>
                )}
              </span>
            ))}
          </div>
          {hint && (
            <p className="mt-2 text-sm text-indigo-900">
              <span className="font-semibold">下一步：</span>
              {hint}
            </p>
          )}
        </div>
      )}

      <div
        className={`mt-4 rounded-2xl bg-white p-6 shadow-sm ${
          stale ? "ring-2 ring-red-500" : "ring-1 ring-slate-200"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{ticket.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{ticket.description}</p>
          </div>
          <TicketStatusBadge status={ticket.status} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">地點</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {ticket.asset.code} — {ticket.asset.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">優先級</dt>
            <dd className="mt-1">
              <PriorityBadge priority={ticket.priority} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">觸發人</dt>
            <dd className="mt-1 text-sm text-slate-900">{ticket.triggeredBy.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">工程師</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {ticket.assignedTo?.name ?? "尚未指派"}
            </dd>
          </div>
          {ticket.resolutionNote && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">工程師回報</dt>
              <dd className="mt-1 text-sm text-slate-900">{ticket.resolutionNote}</dd>
            </div>
          )}
          {ticket.frontDeskNote && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">前台協調備註</dt>
              <dd className="mt-1 text-sm text-slate-900">{ticket.frontDeskNote}</dd>
            </div>
          )}
        </dl>

        {attachments.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-slate-500">現場照片</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {attachments.map((photo) => (
                <a
                  key={photo.id}
                  href={uploadUrl(photo.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg ring-1 ring-slate-200"
                >
                  <img
                    src={uploadUrl(photo.url)}
                    alt={photo.kind === "COMPLETION" ? "完工照片" : "現場照片"}
                    className="h-28 w-28 object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {profile?.role === "ADMIN" && ticket.status === "OPEN" && (
        <form
          onSubmit={(e) => void handleAssign(e)}
          className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200"
        >
          <h2 className="font-medium text-slate-900">手動派單</h2>
          {engineers.length === 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              尚無工程師帳號，請先到
              <Link to="/users" className="mx-1 text-indigo-600 underline">
                員工管理
              </Link>
              新增工程師，才能進入「開始作業 → 現場回報」流程。
            </p>
          ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={assignToId}
              onChange={(e) => setAssignToId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name}（{eng.status === "IDLE" ? "閒置" : "忙碌"} · {eng.skills.join(", ") || "無技能標籤"}）
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting || engineers.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              指派工程師
            </button>
          </div>
          )}
        </form>
      )}

      {canDoEngineerActions && ticket.status === "ASSIGNED" && (
        <div className="mt-6">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleStartWork()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            開始作業
          </button>
        </div>
      )}

      {canDoEngineerActions && ticket.status === "IN_PROGRESS" && (
        <form
          onSubmit={(e) => void handleReport(e)}
          className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200"
        >
          <h2 className="font-medium text-slate-900">現場回報（必填照片）</h2>
          <p className="mt-1 text-sm text-slate-500">
            完工請上傳修復後照片；若需換房或無法處理，請選「需前台協助」
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReportType("COMPLETED")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                reportType === "COMPLETED"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              已處理完成
            </button>
            <button
              type="button"
              onClick={() => setReportType("NEEDS_FRONT_DESK")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                reportType === "NEEDS_FRONT_DESK"
                  ? "bg-orange-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              無法處理，需前台協助
            </button>
          </div>

          <textarea
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            required
            rows={3}
            placeholder={
              reportType === "COMPLETED"
                ? "說明處理內容，例：已更換閥芯，測試正常"
                : "說明原因，例：需換房，馬桶底座破裂無法當日修復"
            }
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => setReportPhotos(Array.from(e.target.files ?? []))}
            className="mt-3 block w-full text-sm text-slate-600"
          />
          {reportPhotos.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">已選 {reportPhotos.length} 張照片</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              reportType === "COMPLETED"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-orange-600 hover:bg-orange-700"
            }`}
          >
            {submitting
              ? "送出中…"
              : reportType === "COMPLETED"
                ? "提交完工回報"
                : "提交並通知前台"}
          </button>
        </form>
      )}

      {isFrontDesk && ticket.status === "PENDING_FRONT_DESK" && (
        <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-5">
          <h2 className="font-medium text-orange-900">前台協調處理</h2>
          <p className="mt-1 text-sm text-orange-800">
            工程師無法自行處理，請協助換房、通知客人或安排替代方案
          </p>
          <textarea
            value={frontDeskNote}
            onChange={(e) => setFrontDeskNote(e.target.value)}
            rows={3}
            placeholder="記錄與客人的協調結果，例：已安排 508 換房並通知房務"
            className="mt-3 w-full rounded-lg border border-orange-200 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting || !frontDeskNote.trim()}
              onClick={() => void handleFrontDeskResolve("RESUME")}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              已協調，繼續維修
            </button>
            <button
              type="button"
              disabled={submitting || !frontDeskNote.trim()}
              onClick={() => void handleFrontDeskResolve("CLOSE")}
              className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-medium text-orange-900 disabled:opacity-50"
            >
              結案（以換房等方式處理）
            </button>
          </div>
        </div>
      )}

      {canManageClose &&
        (ticket.status === "IN_PROGRESS" || ticket.status === "COMPLETED") && (
          <form
            onSubmit={(e) => void handleClose(e)}
            className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200"
          >
            <h2 className="font-medium text-slate-900">
              {ticket.status === "COMPLETED" ? "財務結案" : "完工結案"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {ticket.status === "COMPLETED"
                ? "工程已回報完工，耗材可選填"
                : "結案將扣除庫存並寫入成本紀錄（建議先提交現場回報）"}
            </p>
            {inventory.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <select
                  value={selectedInventory}
                  onChange={(e) => setSelectedInventory(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">不扣耗材</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}（庫存 {item.quantity}）
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="數量"
                />
                <input
                  type="number"
                  min={0}
                  value={laborCost}
                  onChange={(e) => setLaborCost(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="人工費（選填）"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || (ticket.status === "IN_PROGRESS" && !selectedInventory)}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              確認結案
            </button>
          </form>
        )}

      {profile?.role === "ADMIN" &&
        ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING_FRONT_DESK"].includes(ticket.status) && (
          <div className="mt-6">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleCancel()}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              取消工單
            </button>
          </div>
        )}

      {ticket.status === "CLOSED" && (
        <p className="mt-6 text-sm text-emerald-700">
          此工單已結案 · {ticket.closedAt && new Date(ticket.closedAt).toLocaleString("zh-TW")}
        </p>
      )}
    </div>
  );
}
