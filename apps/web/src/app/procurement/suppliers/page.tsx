'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = {
  id: string;
  name: string;
  companyName?: string | null;
  country?: string | null;
  city?: string | null;
  wechat?: string | null;
  phone?: string | null;
  email?: string | null;
  reliabilityScore?: string | number;
};

export default function SuppliersPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
    void loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  async function loadSuppliers() {
    await apiFetch<Supplier[]>('/procurement/suppliers')
      .then(setSuppliers)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  async function deleteSupplier() {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiFetch<{ archived?: boolean; message?: string }>(`/procurement/suppliers/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      setSuccess(result.archived ? t('procurement.suppliers.archived') : t('procurement.suppliers.deleted'));
      setDeleteTarget(null);
      setDeleteReason('');
      await loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  }

  const canDeleteSupplier = Boolean(currentUser && roleCodes(currentUser).includes('CEO'));

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('procurement.suppliers.title')}</h2>
          </div>
          <Link href="/procurement/suppliers/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
            {t('procurement.suppliers.new')}
          </Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('procurement.suppliers.name')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.companyName')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.country')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.city')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.wechat')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.phone')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="px-4 py-3 font-bold">{supplier.name}</td>
                  <td className="px-4 py-3">{supplier.companyName ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.country ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.city ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.wechat ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.phone ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/procurement/suppliers/${supplier.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                      {canDeleteSupplier ? (
                        <button
                          onClick={() => setDeleteTarget(supplier)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          type="button"
                        >
                          {t('common.delete')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deleteTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-slate-950">{t('procurement.suppliers.deleteTitle')}</h3>
              <p className="mt-2 text-sm text-slate-600">{t('procurement.suppliers.deleteMessage')}</p>
              <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-800">{deleteTarget.name}</p>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-700">{t('procurement.suppliers.deleteReason')}</span>
                <textarea
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteReason('');
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                  type="button"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => void deleteSupplier()}
                  disabled={!deleteReason.trim() || deleting}
                  className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:bg-red-300"
                  type="button"
                >
                  {deleting ? t('common.loading') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function roleCodes(user: User) {
  return user.roles?.length ? user.roles : [user.role];
}
