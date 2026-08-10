'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { CLEANUP_COUNT_LABELS } from '@/lib/test-data-cleanup-labels';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

const ALL_CONFIRMATION = 'DELETE ALL TEST DATA';

const CATEGORIES = [
  { id: 'employees', labelKey: 'sysadmin.cleanup.employees' },
  { id: 'customers', labelKey: 'sysadmin.cleanup.customers' },
  { id: 'products', labelKey: 'sysadmin.cleanup.products' },
  { id: 'purchases', labelKey: 'sysadmin.cleanup.purchases' },
  { id: 'warehouse', labelKey: 'sysadmin.cleanup.warehouse' },
  { id: 'branchOrders', labelKey: 'sysadmin.cleanup.branchOrders' },
  { id: 'sales', labelKey: 'sysadmin.cleanup.sales' },
  { id: 'finance', labelKey: 'sysadmin.cleanup.finance' },
  { id: 'all', labelKey: 'sysadmin.cleanup.all' },
] as const;

type CountsResponse = {
  counts: Record<string, number>;
};

export default function TestDataCleanupPage() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reason, setReason] = useState('');
  const [allConfirmation, setAllConfirmation] = useState('');
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  async function loadCounts() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<CountsResponse>('/dev-admin/test-data-cleanup/counts');
      setCounts(data.counts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCounts();
  }, []);

  async function runCleanup(category: string) {
    if (!reason.trim()) {
      setError(t('sysadmin.cleanup.reasonRequired'));
      return;
    }
    if (category === 'all' && allConfirmation !== ALL_CONFIRMATION) {
      setError(t('sysadmin.cleanup.allConfirmationRequired'));
      return;
    }
    setRunning(category);
    setError('');
    /* toast clear */ void 0;
    try {
      await apiFetch('/dev-admin/test-data-cleanup', {
        method: 'POST',
        body: JSON.stringify({
          category,
          reason: reason.trim(),
          confirmation: category === 'all' ? allConfirmation : undefined,
        }),
      });
      toast.success(t('sysadmin.cleanup.success'));
      setPendingCategory(null);
      setAllConfirmation('');
      await loadCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setRunning(null);
    }
  }

  function handleSubmit(event: FormEvent, category: string) {
    event.preventDefault();
    void runCleanup(category);
  }

  return (
    <ProtectedShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('sysadmin.systemManagement')}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">{t('sysadmin.testDataCleanup')}</h1>
          <p className="mt-2 text-slate-600">{t('sysadmin.cleanup.description')}</p>
        </div>

        {loading ? (
          <p className="text-slate-500">{t('common.loading')}</p>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">{t('sysadmin.cleanup.recordCounts')}</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(counts).map(([key, value]) => (
                <li key={key} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <span className="font-semibold text-slate-800">
                    {CLEANUP_COUNT_LABELS[key] ?? key}:
                  </span>{' '}
                  <span className="text-slate-600">{value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('sysadmin.cleanup.reason')}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder={t('sysadmin.cleanup.reasonPlaceholder')}
            />
          </label>

          {pendingCategory === 'all' ? (
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">
                {t('sysadmin.cleanup.typeConfirmation')}: {ALL_CONFIRMATION}
              </span>
              <input
                type="text"
                value={allConfirmation}
                onChange={(e) => setAllConfirmation(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((cat) => (
              <form
                key={cat.id}
                onSubmit={(e) => {
                  if (cat.id === 'all' && pendingCategory !== 'all') {
                    e.preventDefault();
                    setPendingCategory('all');
                    return;
                  }
                  void handleSubmit(e, cat.id);
                }}
              >
                <button
                  type="submit"
                  disabled={running !== null || !reason.trim()}
                  className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {running === cat.id ? t('common.loading') : t(cat.labelKey)}
                </button>
              </form>
            ))}
          </div>
        </section>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-600">{success}</p> : null}
      </div>
    </ProtectedShell>
  );
}
