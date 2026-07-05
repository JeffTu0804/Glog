import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { platformApi } from "../lib/platformApi";
import type { Tenant } from "../types/platform";

export function usePlatformTenants() {
  const { getToken } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken("platform");
        const { tenants: list } = await platformApi.getTenants(token);
        setTenants(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  return { tenants, loading };
}

interface PlatformTenantFilterProps {
  tenants: Tenant[];
  value: string;
  onChange: (tenantId: string) => void;
}

export function PlatformTenantFilter({
  tenants,
  value,
  onChange,
}: PlatformTenantFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
    >
      <option value="">全部飯店</option>
      {tenants.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name}
        </option>
      ))}
    </select>
  );
}

export function TenantLabel({ name, slug }: { name: string; slug: string }) {
  return (
    <div>
      <p className="font-medium text-slate-900">{name}</p>
      <p className="text-xs text-slate-400">{slug}</p>
    </div>
  );
}
