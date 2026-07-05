import { Link } from "react-router-dom";
import { TenantLabel } from "./PlatformTenantFilter";
import {
  ALL_ACCOUNT_STATUSES,
  ALL_POSITION_LEVELS,
  ACCOUNT_STATUS_LABELS,
  POSITION_LEVEL_LABELS,
  type UserAccountStatus,
  type UserPositionLevel,
} from "../lib/employeeLabels";
import {
  ALL_DEPARTMENTS,
  DEPARTMENT_LABELS,
  departmentToRole,
  roleToDepartment,
} from "../lib/department";
import type { Department, UserRole } from "../types/api";
import type { PlatformTenantUser, Tenant } from "../types/platform";

export interface EmployeeEditDraft {
  tenantId: string;
  department: Department;
  role: UserRole;
  positionLevel: UserPositionLevel;
  name: string;
  accountStatus: UserAccountStatus;
}

export function draftFromUser(
  user: PlatformTenantUser,
  defaultTenantId?: string,
): EmployeeEditDraft {
  const role = user.role as UserRole;
  return {
    tenantId: user.tenant?.id ?? defaultTenantId ?? "",
    department: (user.department as Department) ?? roleToDepartment(role),
    role,
    positionLevel: (user.positionLevel as UserPositionLevel) ?? "STAFF",
    name: user.name,
    accountStatus: (user.accountStatus as UserAccountStatus) ?? "ACTIVE",
  };
}

interface PlatformEmployeeTableProps {
  users: PlatformTenantUser[];
  tenants: Tenant[];
  showHotel?: boolean;
  editingId: string | null;
  savingId: string | null;
  draft: EmployeeEditDraft | null;
  onStartEdit: (user: PlatformTenantUser) => void;
  onCancelEdit: () => void;
  onDraftChange: (draft: EmployeeEditDraft) => void;
  onSave: (userId: string) => void;
}

export function PlatformEmployeeTable({
  users,
  tenants,
  showHotel = true,
  editingId,
  savingId,
  draft,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
}: PlatformEmployeeTableProps) {
  return (
    <div className="glog-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {showHotel && <th className="px-5 py-3.5">飯店</th>}
              <th className="px-5 py-3.5">部門</th>
              <th className="px-5 py-3.5">角色</th>
              <th className="px-5 py-3.5">姓名</th>
              <th className="px-5 py-3.5">狀態</th>
              <th className="px-5 py-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => {
              const isEditing = editingId === user.id;
              const d = isEditing && draft ? draft : draftFromUser(user);

              return (
                <tr key={user.id} className={isEditing ? "bg-violet-50/40" : "hover:bg-slate-50/80"}>
                  {showHotel && (
                    <td className="px-5 py-4">
                      {isEditing ? (
                        <select
                          value={d.tenantId}
                          onChange={(e) =>
                            onDraftChange({ ...d, tenantId: e.target.value })
                          }
                          className="glog-select w-full min-w-[140px]"
                        >
                          {tenants.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      ) : user.tenant ? (
                        <Link to={`/manager/tenants/${user.tenant.id}`} className="group">
                          <TenantLabel
                            name={user.tenant.name}
                            slug={user.tenant.slug}
                            link
                          />
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  )}

                  <td className="px-5 py-4">
                    {isEditing ? (
                      <select
                        value={d.department}
                        onChange={(e) => {
                          const department = e.target.value as Department;
                          onDraftChange({
                            ...d,
                            department,
                            role: departmentToRole(department),
                          });
                        }}
                        className="glog-select w-full min-w-[100px]"
                      >
                        {ALL_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {DEPARTMENT_LABELS[dept]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                        {DEPARTMENT_LABELS[user.department as Department] ?? user.department}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {isEditing ? (
                      <select
                        value={d.positionLevel}
                        onChange={(e) =>
                          onDraftChange({
                            ...d,
                            positionLevel: e.target.value as UserPositionLevel,
                          })
                        }
                        className="glog-select w-full min-w-[100px]"
                      >
                        {ALL_POSITION_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {POSITION_LEVEL_LABELS[level]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium text-slate-700">
                        {POSITION_LEVEL_LABELS[user.positionLevel as UserPositionLevel] ??
                          user.positionLevel}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {isEditing ? (
                      <input
                        value={d.name}
                        onChange={(e) => onDraftChange({ ...d, name: e.target.value })}
                        className="glog-input min-w-[120px]"
                      />
                    ) : (
                      <>
                        <p className="font-semibold text-slate-900">{user.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{user.email}</p>
                      </>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {isEditing ? (
                      <select
                        value={d.accountStatus}
                        onChange={(e) =>
                          onDraftChange({
                            ...d,
                            accountStatus: e.target.value as UserAccountStatus,
                          })
                        }
                        className="glog-select"
                      >
                        {ALL_ACCOUNT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ACCOUNT_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <AccountStatusBadge
                        status={user.accountStatus as UserAccountStatus}
                      />
                    )}
                  </td>

                  <td className="px-5 py-4 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={savingId === user.id}
                          onClick={() => onSave(user.id)}
                          className="glog-btn-manager px-3 py-1.5 text-xs"
                        >
                          {savingId === user.id ? "儲存中…" : "儲存"}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === user.id}
                          onClick={onCancelEdit}
                          className="glog-btn-ghost text-xs"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartEdit(user)}
                        className="glog-btn-ghost text-xs text-violet-600"
                      >
                        編輯
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs text-slate-500">
        共 {users.length} 位員工
      </div>
    </div>
  );
}

function AccountStatusBadge({ status }: { status: UserAccountStatus }) {
  const styles: Record<UserAccountStatus, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
    DISABLED: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
    SUSPENDED: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}
