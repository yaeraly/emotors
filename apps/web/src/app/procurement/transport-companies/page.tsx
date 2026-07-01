'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canManageTransportCompany, canViewTransportCompany } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type TransportCompany = {
  id: string;
  name: string;
  companyCode: string;
  country?: string | null;
  city?: string | null;
  transportType: string;
  status: string;
  phone?: string | null;
  email?: string | null;
};

export default function TransportCompaniesPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<TransportCompany[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<TransportCompany | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  async function loadCompanies() {
    await apiFetch<TransportCompany[]>('/procurement/transport-companies')
      .then(setCompanies)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    if (currentUser && canViewTransportCompany(currentUser)) void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function archiveCompany() {
    if (!archiveTarget) return;
    setArchiving(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/transport-companies/${archiveTarget.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason: archiveReason.trim() || undefined }),
      });
      setSuccess(t('procurement.transportCompanies.archived'));
      setArchiveTarget(null);
      setArchiveReason('');
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setArchiving(false);
    }
  }

  const canManage = canManageTransportCompany(currentUser);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('procurement.transportCompanies.title')}</h2>
          </div>
          {canManage ? (
            <Link href="/procurement/transport-companies/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('procurement.transportCompanies.create')}
            </Link>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('procurement.transportCompanies.name')}</th>
                <th className="px-4 py-3">{t('procurement.transportCompanies.companyCode')}</th>
                <th className="px-4 py-3">{t('procurement.transportCompanies.transportType')}</th>
                <th className="px-4 py-3">{t('procurement.transportCompanies.city')}</th>
                <th className="px-4 py-3">{t('procurement.transportCompanies.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{company.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{company.companyCode}</td>
                  <td className="px-4 py-3">{t(`procurement.transportCompanies.type.${company.transportType}`)}</td>
                  <td className="px-4 py-3">{company.city ?? '-'}</td>
                  <td className="px-4 py-3">{t(`procurement.transportCompanies.statusValue.${company.status}`)}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && company.status !== 'ARCHIVED' ? (
                      <div className="flex justify-end gap-2">
                        <Link href={`/procurement/transport-companies/${company.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                          {t('common.edit')}
                        </Link>
                        <button type="button" onClick={() => setArchiveTarget(company)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                          {t('procurement.transportCompanies.archive')}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!companies.length ? <p className="px-4 py-8 text-center text-sm text-slate-500">{t('procurement.transportCompanies.empty')}</p> : null}
        </div>

        {archiveTarget ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
            <h3 className="text-lg font-bold text-red-900">{t('procurement.transportCompanies.archiveTitle')}</h3>
            <p className="mt-2 text-sm text-red-800">{archiveTarget.name}</p>
            <textarea value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="mt-4 w-full rounded-xl border border-red-200 px-3 py-2" placeholder={t('procurement.transportCompanies.archiveReason')} />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setArchiveTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('common.cancel')}</button>
              <button type="button" disabled={archiving} onClick={() => void archiveCompany()} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:bg-red-300">
                {archiving ? t('common.loading') : t('procurement.transportCompanies.archive')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
