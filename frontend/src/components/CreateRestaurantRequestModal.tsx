import { type FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import {
  defaultTomorrowNoonLocal,
  localDatetimeToIso,
  reminderBeforeScheduled,
} from "../lib/serviceRequest";

interface CreateRestaurantRequestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateRestaurantRequestModal({
  open,
  onClose,
  onCreated,
}: CreateRestaurantRequestModalProps) {
  const { getToken } = useAuth();
  const [guestRoom, setGuestRoom] = useState("");
  const [guestName, setGuestName] = useState("");
  const [title, setTitle] = useState("中餐廳預約");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultTomorrowNoonLocal);
  const [reminderAt, setReminderAt] = useState(
    reminderBeforeScheduled(defaultTomorrowNoonLocal()),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function handleScheduledChange(value: string) {
    setScheduledAt(value);
    setReminderAt(reminderBeforeScheduled(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      await api.createServiceRequest(token, {
        type: "RESTAURANT_RESERVATION",
        title,
        description: description || undefined,
        guestRoom,
        guestName,
        targetDepartment: "FOOD_BEVERAGE",
        scheduledAt: localDatetimeToIso(scheduledAt),
        reminderAt: reminderAt ? localDatetimeToIso(reminderAt) : undefined,
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
        <h2 className="text-lg font-semibold">建立餐廳預約</h2>
        <p className="mt-1 text-sm text-slate-500">送出後將通知餐飲部確認預約</p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <FormField label="房號" value={guestRoom} onChange={setGuestRoom} required placeholder="例：305" />
          <FormField
            label="客人姓名"
            value={guestName}
            onChange={setGuestName}
            required
            placeholder="例：林先生"
          />
          <FormField label="請求標題" value={title} onChange={setTitle} required />
          <div>
            <label className="mb-1 block text-sm font-medium">說明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="人數、特殊需求、過敏等"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">預約時間</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => handleScheduledChange(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">提醒客務部通知客人</label>
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
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
              {submitting ? "送出中…" : "送至餐飲部"}
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
