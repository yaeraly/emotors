'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FinanceErrorState, FinanceLayout } from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { isBranchAccountantUser } from '@/lib/rbac';
import type { FinanceAccountTypeDefinition, User } from '@/lib/types';

const BRANCH_ACCOUNTANT_TYPES = new Set(['BANK', 'QR']);

export default function CreateFinanceAccountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [types, setTypes] = useState<FinanceAccountTypeDefinition[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    typeCode: 'BANK',
    currency: 'KGS',
    openingBalance: '0',
    bankName: '',
    bankAccountNo: '',
    iban: '',
    swiftBic: '',
    qrProvider: '',
    qrMerchantId: '',
    posProvider: '',
    notes: '',
  });

  const isBranchAccountant = Boolean(user && isBranchAccountantUser(user));

  useEffect(() => {
    Promise.all([
      apiFetch<FinanceAccountTypeDefinition[]>('/finance/account-types'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([accountTypes, currentUser]) => {
        setTypes(accountTypes);
        setUser(currentUser);
        if (isBranchAccountantUser(currentUser)) {
          setForm((current) => ({
            ...current,
            typeCode: accountTypes.some((type) => type.code === 'BANK') ? 'BANK' : 'QR',
          }));
        }
      })
      .catch(() => null);
  }, []);

  const availableTypes = useMemo(() => {
    if (!isBranchAccountant) return types;
    return types.filter((type) => BRANCH_ACCOUNTANT_TYPES.has(type.code));
  }, [isBranchAccountant, types]);

  const showBank = ['BANK', 'DEPOSIT', 'CREDIT_LINE', 'PAYROLL_ACCOUNT', 'SUPPLIER_ACCOUNT'].includes(form.typeCode);
  const showQr = form.typeCode === 'QR';
  const showPos = form.typeCode === 'POS';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    try {
      setSubmitting(true);
      const openingBalance = Number(form.openingBalance || 0);
      const account = await apiFetch<{ id: string }>('/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          typeCode: form.typeCode,
          currency: form.currency,
          openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
          bankName: showBank ? form.bankName.trim() : undefined,
          bankAccountNo: showBank ? form.bankAccountNo.trim() : undefined,
          iban: showBank ? form.iban.trim() || undefined : undefined,
          qrProvider: showQr ? form.qrProvider.trim() : undefined,
          qrMerchantId: showQr ? form.qrMerchantId.trim() || undefined : undefined,
          posTerminalId: showPos ? form.posProvider : undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (openingBalance <= 0.009) {
        router.push(`/finance/accounts/${account.id}?created=zero`);
        return;
      }

      router.push(`/finance/accounts/${account.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
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
          {availableTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
        </select>
        <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder={t('finance.currency')} className="rounded-xl border border-slate-300 px-4 py-3" />
        <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} placeholder={t('finance.openingBalance')} className="rounded-xl border border-slate-300 px-4 py-3" />
        {showBank ? (
          <>
            <input required value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder={t('finance.bankName')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input required value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} placeholder={t('finance.bankAccountNo')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder={t('finance.iban')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input value={form.swiftBic} onChange={(e) => setForm({ ...form, swiftBic: e.target.value })} placeholder={t('finance.swiftBic')} className="rounded-xl border border-slate-300 px-4 py-3" />
          </>
        ) : null}
        {showQr ? (
          <>
            <input required value={form.qrProvider} onChange={(e) => setForm({ ...form, qrProvider: e.target.value })} placeholder={t('finance.qrProvider')} className="rounded-xl border border-slate-300 px-4 py-3" />
            <input value={form.qrMerchantId} onChange={(e) => setForm({ ...form, qrMerchantId: e.target.value })} placeholder={t('finance.qrMerchantId')} className="rounded-xl border border-slate-300 px-4 py-3" />
          </>
        ) : null}
        {showPos ? <input value={form.posProvider} onChange={(e) => setForm({ ...form, posProvider: e.target.value })} placeholder={t('finance.posProvider')} className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2" /> : null}
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('finance.notes')} className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2" />
        <div className="flex gap-3 md:col-span-2">
          <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{t('common.save')}</button>
          <Link href="/finance/accounts" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</Link>
        </div>
      </form>
    </FinanceLayout>
  );
}
