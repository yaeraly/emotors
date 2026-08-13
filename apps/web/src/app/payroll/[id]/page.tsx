'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setRecord(await apiFetch<Record<string, unknown>>(`/payroll/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(path: 'approve' | 'mark-paid', message: string) {
    setError('');
    /* toast clear */ void 0;
    try {
      setRecord(await apiFetch<Record<string, unknown>>(`/payroll/${id}/${path}`, { method: 'POST' }));
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('payroll.title')}</p><h2 className="text-3xl font-bold">{String(record?.id ?? '-')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex gap-2">
          <button onClick={() => void action('approve', t('payroll.approve'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">{t('payroll.approve')}</button>
          <button onClick={() => void action('mark-paid', t('payroll.paid'))} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700" type="button">{t('payroll.markPaid')}</button>
        </div>
        {record ? <pre className="rounded-3xl border border-slate-200 bg-white p-6 text-sm shadow-sm">{JSON.stringify(record, null, 2)}</pre> : null}
      </section>
    </ProtectedShell>
  );
}
