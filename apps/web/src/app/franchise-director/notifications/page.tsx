'use client';

import { useEffect, useState } from 'react';
import { FranchiseDirectorShell } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type AlertRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  status: string;
  createdAt: string;
};

export default function FranchiseDirectorNotificationsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<AlertRow[]>('/franchise-director/notifications')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.notifications">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('franchiseDirector.noNotifications')}</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-950">{row.title}</p>
                <span className="text-xs text-slate-500">{row.type} · {row.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{row.message}</p>
              <p className="mt-2 text-xs text-slate-400">{new Date(row.createdAt).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </FranchiseDirectorShell>
  );
}
