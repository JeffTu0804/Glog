import { useCallback, useEffect, useState } from "react";
import {
  PlatformEmployeeTable,
  draftFromUser,
  type EmployeeEditDraft,
} from "../../components/PlatformEmployeeTable";
import { usePlatformTenants } from "../../components/PlatformTenantFilter";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { PlatformTenantFilter } from "../../components/PlatformTenantFilter";
import { useAuth } from "../../context/AuthContext";
import { platformApi } from "../../lib/platformApi";
import type { PlatformTenantUser } from "../../types/platform";

export function PlatformUsersPage() {
  const { getToken } = useAuth();
  const { tenants } = usePlatformTenants();
  const [tenantId, setTenantId] = useState("");
  const [users, setUsers] = useState<PlatformTenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmployeeEditDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken("platform");
      const { users: list } = await platformApi.getUsers(token, {
        tenantId: tenantId || undefined,
      });
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [getToken, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(user: PlatformTenantUser) {
    setEditingId(user.id);
    setDraft(draftFromUser(user));
    setSuccess("");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function handleSave(userId: string) {
    if (!draft) return;
    setSavingId(userId);
    setError("");
    setSuccess("");
    try {
      const token = await getToken("platform");
      const { user } = await platformApi.updateUser(token, userId, {
        tenantId: draft.tenantId || undefined,
        role: draft.role,
        name: draft.name,
        accountStatus: draft.accountStatus,
        positionLevel: draft.positionLevel,
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? user : u)));
      setEditingId(null);
      setDraft(null);
      setSuccess("已儲存員工資料");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="員工管理"
        subtitle="跨飯店內部人員 — 可直接編輯飯店、部門、角色、姓名與狀態"
        accent="violet"
        action={
          <PlatformTenantFilter tenants={tenants} value={tenantId} onChange={setTenantId} />
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}
      {success && <AlertBanner variant="success">{success}</AlertBanner>}

      {loading ? (
        <p className="text-slate-500">載入中…</p>
      ) : users.length === 0 ? (
        <EmptyState message="尚無員工資料" hint="員工加入飯店後會顯示於此" />
      ) : (
        <PlatformEmployeeTable
          users={users}
          tenants={tenants}
          showHotel
          editingId={editingId}
          savingId={savingId}
          draft={draft}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onDraftChange={setDraft}
          onSave={(id) => void handleSave(id)}
        />
      )}
    </div>
  );
}
