'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ProtectedShell } from '@/components/ProtectedShell';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  role?: string | null;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
  user?: { fullName: string; email: string } | null;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AuditLog[]>('/audit-logs')
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-500">Role assignments, logins, and critical system changes.</p>
        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Module</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2">{log.user?.fullName ?? '—'}</td>
                    <td className="px-3 py-2">{log.role ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{log.action}</td>
                    <td className="px-3 py-2">{log.entity}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {log.entityId ? `ID: ${log.entityId}` : ''}
                      {log.metadata ? ` ${JSON.stringify(log.metadata)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ProtectedShell>
  );
}
