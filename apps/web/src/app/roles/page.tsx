'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ProtectedShell } from '@/components/ProtectedShell';

type RbacRole = {
  id: string;
  code: string;
  name: string;
  permissions: { permission: { code: string } }[];
};

export default function RolesPage() {
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<RbacRole[]>('/rbac/roles')
      .then(setRoles)
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Roles & Permissions</h1>
        <p className="mt-1 text-sm text-slate-500">HQ role capability matrix synced from the RBAC catalog.</p>
        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="mt-6 space-y-4">
            {roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-slate-200 p-4">
                <h2 className="font-semibold text-slate-900">{role.name}</h2>
                <p className="text-xs uppercase tracking-wide text-slate-400">{role.code}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {role.permissions.map((entry) => (
                    <span
                      key={entry.permission.code}
                      className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {entry.permission.code}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </ProtectedShell>
  );
}
