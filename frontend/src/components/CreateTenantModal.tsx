import { type FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { platformApi } from "../lib/platformApi";

/**
 * 平台管理員「建立新飯店」表單 Modal。
 * 呼叫 POST /api/platform/v1/tenants（platformApi.createTenant），
 * 只建立租戶，不會把當前管理員綁成飯店員工。
 */
export function CreateTenantModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setName("");
    setSlug("");
    setContactEmail("");
    setError("");
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return; // 防重複點擊

    if (!name.trim() || !slug.trim()) {
      setError("請填寫飯店名稱與飯店代碼");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const token = await getToken("platform");
      await platformApi.createTenant(token, {
        name: name.trim(),
        slug: slug.trim(),
        contactEmail: contactEmail.trim() || undefined,
      });
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div className="glog-card max-h-[92vh] w-full max-w-lg overflow-y-auto">
        {/* 標題 */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">建立新飯店</h2>
            <p className="mt-1 text-sm text-slate-500">
              建立一個新的租戶，員工即可用飯店代碼加入。
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="glog-btn-ghost -mr-2 -mt-1 text-slate-400 hover:text-slate-600"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          <div className="space-y-1.5">
            <label htmlFor="tenant-name" className="block text-sm font-medium text-slate-700">
              飯店名稱 <span className="text-rose-500">*</span>
            </label>
            <input
              id="tenant-name"
              type="text"
              className="glog-input focus:border-violet-400 focus:ring-violet-100"
              placeholder="例：台北君悅飯店"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tenant-slug" className="block text-sm font-medium text-slate-700">
              飯店代碼 <span className="text-rose-500">*</span>
            </label>
            <input
              id="tenant-slug"
              type="text"
              className="glog-input focus:border-violet-400 focus:ring-violet-100"
              placeholder="例：taipei-grand"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={submitting}
              required
            />
            <p className="text-xs text-slate-400">
              英文小寫與連字號，員工加入飯店時需輸入此代碼。
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tenant-email" className="block text-sm font-medium text-slate-700">
              聯絡 Email（選填）
            </label>
            <input
              id="tenant-email"
              type="email"
              className="glog-input focus:border-violet-400 focus:ring-violet-100"
              placeholder="contact@hotel.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="glog-btn-secondary"
            >
              取消
            </button>
            <button type="submit" disabled={submitting} className="glog-btn-manager">
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  建立中…
                </>
              ) : (
                "建立飯店"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
