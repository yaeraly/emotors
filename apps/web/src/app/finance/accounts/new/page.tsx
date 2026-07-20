'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FinanceErrorState, FinanceLayout } from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceAccountTypeDefinition } from '@/lib/types';

export default function CreateFinanceAccountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [types, setTypes] = useState<FinanceAccountTypeDefinition[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    typeCode: 'CASH',
    currency: 'KGS',
    openingBalance: '',
    bankName: '',
    bankAccountNo: '',
    iban: '',
    swiftBic: '',
    qrProvider: '',
    posProvider: '',
    notes: '',
  });

  useEffect(() => {
    apiFetch<FinanceAccountTypeDefinition[]>('/finance/account-types').then(setTypes).catch(() => null);
  }, []);

  const showBank = ['BANK', 'DEPOSIT', 'CREDIT_LINE', 'PAYROLL_ACCOUNT', 'SUPPLIER_ACCOUNT'].includes(form.typeCode);
  const showQr = form.typeCode === 'QR';
  const showPos = form.typeCode === 'POS';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const account = await apiFetch<{ id: string }>('/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          typeCode: form.typeCode,
          currency: form.currency,
          bankName: showBank ? form.bankName : undefined,
          bankAccountNo: showBank ? form.bankAccountNo : undefined,
          qrProvider: showQr ? form.qrProvider : undefined,
          posTerminalId: showPos ? form.posProvider : undefined,
          notes: form.notes || undefined,
        }),
      });
      if (form.openingBalance) {
        await apiFetch(`/finance/accounts/${account.id}/opening-balance`, {
          method: 'POST',
          body: JSON.stringify({ amount: Number(form.openingBalance) }),
        });
      }
      router.push(`/finance/accounts/${account.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <FinanceLayout
      titleKey="finance.createAccount"
      breadcrumbs={[
        { href: '/finance/accounts', labelKey: 'finance.accounts' },
        { labelKey: 'finance.createAccount' },
      ]}
    >
      {error ? <FinanceErrorState message={error} /> : null}
      <form onSubmit={onSubmit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('finance.accountName')} className="rounded-xl border border-slate-300 px-4 py-3" />
        <select value={form.typeCode} onChange={(e) => setForm({ ...form, typeCode: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
          {types.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
        </select>
        <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder={t('finance.currency')} className="rounded-xl border border-slate-300 px-4 py-3" />
        <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} placeholder={t('finance.openingBalance')} className="rounded-xl border border-slate-300 px-4 py-3" />
        {showBank ? (
          <>
            <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder={t('finance.bankName')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} placeholder={t('finance.bankAccountNo')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder={t('finance.iban')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input value={form.swiftBic} onChange={(e) => setForm({ ...form, swiftBic: e.target.value })} placeholder={t('finance.swiftBic')} className="rounded-xl border border-slate-300 px-4 py-3" />
          </>
        ) : null}
        {showQr ? <input value={form.qrProvider} onChange={(e) => setForm({ ...form, qrProvider: e.target.value })} placeholder={t('finance.qrProvider')} className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2" /> : null}
        {showPos ? <input value={form.posProvider} onChange={(e) => setForm({ ...form, posProvider: e.target.value })} placeholder={t('finance.posProvider')} className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2" /> : null}
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('finance.notes')} className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2" />
        <div className="flex gap-3 md:col-span-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('common.save')}</button>
          <Link href="/finance/accounts" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</Link>
        </div>
      </form>
    </FinanceLayout>
  );
}
