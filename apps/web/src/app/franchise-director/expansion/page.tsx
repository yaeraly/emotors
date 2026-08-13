'use client';

import { FormEvent, useEffect, useState } from 'react';
import { FranchiseDirectorShell } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

const STATUSES = ['LEAD', 'NEGOTIATION', 'AGREEMENT', 'PREPARING', 'OPENING', 'ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

type Lead = {
  id: string;
  fullName: string;
  phone: string;
  city?: string | null;
  region?: string | null;
  status: string;
  agreementStatus?: string | null;
  documentsNote?: string | null;
  plannedOpeningDate?: string | null;
  notes?: string | null;
  responsibleManager?: { fullName: string } | null;
};

export default function FranchiseDirectorExpansionPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Lead[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    city: '',
    region: '',
    status: 'LEAD',
    agreementStatus: '',
    documentsNote: '',
    plannedOpeningDate: '',
    notes: '',
  });

  async function load() {
    try {
      setRows(await apiFetch<Lead[]>('/franchise-director/expansion'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch('/franchise-director/expansion', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({
        fullName: '',
        phone: '',
        city: '',
        region: '',
        status: 'LEAD',
        agreementStatus: '',
        documentsNote: '',
        plannedOpeningDate: '',
        notes: '',
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function updateStatus(id: string, status: string) {
    setError('');
    try {
      await apiFetch(`/franchise-director/expansion/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.expansion">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <form onSubmit={onCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
        <input required value={form.fullName} onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))} placeholder={t('franchiseDirector.fullName')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input required value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder={t('franchiseDirector.phone')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} placeholder={t('franchiseDirector.city')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.region} onChange={(e) => setForm((c) => ({ ...c, region: e.target.value }))} placeholder={t('franchiseDirector.region')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <input type="date" value={form.plannedOpeningDate} onChange={(e) => setForm((c) => ({ ...c, plannedOpeningDate: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.agreementStatus} onChange={(e) => setForm((c) => ({ ...c, agreementStatus: e.target.value }))} placeholder={t('franchiseDirector.agreementStatus')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2" />
        <input value={form.documentsNote} onChange={(e) => setForm((c) => ({ ...c, documentsNote: e.target.value }))} placeholder={t('franchiseDirector.documents')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-3" />
        <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-3">
          {t('franchiseDirector.createLead')}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('franchiseDirector.fullName')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.phone')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.region')}</th>
              <th className="px-4 py-3">{t('common.status')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.plannedOpening')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.responsibleManager')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold">{row.fullName}</td>
                <td className="px-4 py-3">{row.phone}</td>
                <td className="px-4 py-3">{row.region ?? row.city ?? '-'}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.plannedOpeningDate ? new Date(row.plannedOpeningDate).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-3">{row.responsibleManager?.fullName ?? '-'}</td>
                <td className="px-4 py-3">
                  <select
                    value={row.status}
                    onChange={(e) => void updateStatus(row.id, e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FranchiseDirectorShell>
  );
}
