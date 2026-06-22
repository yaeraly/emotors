'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewBranchPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    city: '',
    address: '',
    phone: '',
    ownerName: '',
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await apiFetch('/branches', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSuccess(t('branches.created'));
      window.localStorage.setItem('emotors-branch-created', '1');
      router.push('/branches');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('phase2.title')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branches.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          {Object.keys(form).map((key) => (
            <label key={key} className="block">
              <span className="text-sm font-semibold text-slate-700">{key}</span>
              <input
                value={form[key as keyof typeof form]}
                onChange={(event) => setField(key as keyof typeof form, event.target.value)}
                required={key === 'name' || key === 'code'}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
          ))}
          <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-2" type="submit">
            {saving ? t('common.loading') : t('common.create')}
          </button>
        </section>
      </form>
    </ProtectedShell>
  );
}
