'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { formatKgs } from '@/lib/money';
import {
  hasFullAccess,
  hasRole,
  isBranchWarehouseOperator,
  isHqAccountantUser,
} from '@/lib/rbac';
import { toast } from '@/lib/toast';
import type { BranchHqReturn, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

function BranchHqReturnsPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const financeView = searchParams.get('finance') === '1';
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<BranchHqReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const me = await apiFetch<User>('/auth/me');
        setUser(me);
        const list = await apiFetch<BranchHqReturn[]>('/branch-hq-returns');
        const nextRows =
          financeView || isHqAccountantUser(me)
            ? list.filter(
                (item) =>
                  item.financialAdjustment?.status === 'PENDING' ||
                  item.status === 'HQ_ACCEPTED' ||
                  item.status === 'DISCREPANCY' ||
                  item.status === 'COMPLETED',
              )
            : list;
        setRows(nextRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('branchHqReturn.loadError');
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [financeView, t]);

  const canCreate = useMemo(
    () =>
      Boolean(
        user &&
          (isBranchWarehouseOperator(user) ||
            hasFullAccess(user) ||
            hasRole(user, 'CEO') ||
            hasRole(user, 'OWNER')),
      ),
    [user],
  );

  const title =
    financeView || isHqAccountantUser(user)
      ? t('branchHqReturn.menuFinance')
      : t('branchHqReturn.title');

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('branchHqReturn.title')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{title}</h2>
        </div>
        {canCreate ? (
          <Link
            href="/branch-hq-returns/new"
            className="inline-flex h-fit items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('branchHqReturn.create')}
          </Link>
        ) : null}
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('branchHqReturn.number')}</th>
                <th className="px-4 py-3">{t('branchHqReturn.status')}</th>
                <th className="px-4 py-3">{t('branchHqReturn.itemsCount')}</th>
                <th className="px-4 py-3">{t('branchHqReturn.quantity')}</th>
                <th className="px-4 py-3">{t('branchHqReturn.returnSum')}</th>
                <th className="px-4 py-3">{t('branchHqReturn.date')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-slate-500">
                    {t('branchHqReturn.empty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.returnNumber}</td>
                    <td className="px-4 py-3">{t(`branchHqReturn.status.${row.status}`)}</td>
                    <td className="px-4 py-3">{row.totalLineCount}</td>
                    <td className="px-4 py-3">{row.totalQuantity}</td>
                    <td className="px-4 py-3">{formatKgs(row.totalReturnValueKgs)}</td>
                    <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/branch-hq-returns/${row.id}`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        {t('branchHqReturn.open')}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function BranchHqReturnsPage() {
  return (
    <ProtectedShell>
      <Suspense fallback={null}>
        <BranchHqReturnsPageContent />
      </Suspense>
    </ProtectedShell>
  );
}
