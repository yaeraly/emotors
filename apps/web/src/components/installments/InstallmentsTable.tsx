'use client';

import Link from 'next/link';
import type { SaleInstallmentApproval } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';
import { formatCompactDate, formatMoneyKgs } from '@/components/sales/SaleFormPrimitives';

export type InstallmentRow = SaleInstallmentApproval & {
  sale: {
    id: string;
    receiptNumber: string;
    customer: { id: string; fullName: string; phone: string };
    seller?: { id: string; fullName: string };
  };
  manager?: { id: string; fullName: string } | null;
};

type Props = {
  installments: InstallmentRow[];
  loading: boolean;
  variant?: 'active' | 'closed';
};

export function InstallmentsTable({ installments, loading, variant = 'active' }: Props) {
  const { t } = useTranslation();
  const showFinanced = variant === 'active';
  const colCount = showFinanced ? 9 : 7;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[18%] px-3 py-2.5">{t('sales.customer')}</th>
              <th className="w-[10%] px-2 py-2.5">{t('sales.receipt')}</th>
              <th className="w-[10%] px-2 py-2.5">{t('sales.installmentColAmount')}</th>
              {showFinanced ? (
                <>
                  <th className="w-[9%] px-2 py-2.5">{t('sales.installmentColDownPayment')}</th>
                  <th className="w-[9%] px-2 py-2.5">{t('sales.paidAmount')}</th>
                  <th className="w-[9%] px-2 py-2.5">{t('sales.installmentColFinanced')}</th>
                </>
              ) : (
                <th className="w-[10%] px-2 py-2.5">{t('sales.paidAmount')}</th>
              )}
              <th className="w-[10%] px-2 py-2.5">{t('sales.installmentColDueDate')}</th>
              <th className="w-[12%] px-2 py-2.5">{t('common.status')}</th>
              <th className="w-[8%] px-2 py-2.5">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : installments.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-slate-500">
                  {variant === 'active' ? t('sales.noInstallments') : t('sales.noClosedInstallments')}
                </td>
              </tr>
            ) : (
              installments.map((installment) => (
                <InstallmentDesktopRow
                  key={installment.id}
                  installment={installment}
                  showFinanced={showFinanced}
                  t={t}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {t('common.loading')}
          </p>
        ) : installments.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {variant === 'active' ? t('sales.noInstallments') : t('sales.noClosedInstallments')}
          </p>
        ) : (
          installments.map((installment) => (
            <InstallmentMobileCard
              key={installment.id}
              installment={installment}
              showFinanced={showFinanced}
              t={t}
            />
          ))
        )}
      </div>
    </>
  );
}

function InstallmentDesktopRow({
  installment,
  showFinanced,
  t,
}: {
  installment: InstallmentRow;
  showFinanced: boolean;
  t: (key: string) => string;
}) {
  const statusLabel = getStatusLabel({ module: 'installmentApproval', status: installment.status, t });
  const paid = Number(installment.installmentPaidAmount ?? installment.paidAmount ?? 0);
  const financed = Number(installment.financedAmount ?? 0);

  return (
    <tr>
      <td className="px-3 py-2.5">
        <p className="truncate font-semibold text-slate-900">{installment.sale.customer.fullName}</p>
        <p className="truncate text-xs text-slate-500">{installment.sale.customer.phone}</p>
      </td>
      <td className="truncate px-2 py-2.5">{installment.sale.receiptNumber}</td>
      <td className="whitespace-nowrap px-2 py-2.5">{formatMoneyKgs(installment.totalAmount)}</td>
      {showFinanced ? (
        <>
          <td className="whitespace-nowrap px-2 py-2.5">
            {formatMoneyKgs(installment.downPayment ?? installment.initialPayment)}
          </td>
          <td className="whitespace-nowrap px-2 py-2.5">{formatMoneyKgs(paid)}</td>
          <td className="whitespace-nowrap px-2 py-2.5">{formatMoneyKgs(financed)}</td>
        </>
      ) : (
        <td className="whitespace-nowrap px-2 py-2.5">{formatMoneyKgs(paid)}</td>
      )}
      <td className="whitespace-nowrap px-2 py-2.5">{formatCompactDate(installment.dueDate)}</td>
      <td className="px-2 py-2.5 text-xs">{statusLabel}</td>
      <td className="px-2 py-2.5">
        <Link
          href={`/installments/${installment.id}`}
          className="inline-flex rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t('common.open')}
        </Link>
      </td>
    </tr>
  );
}

function InstallmentMobileCard({
  installment,
  showFinanced,
  t,
}: {
  installment: InstallmentRow;
  showFinanced: boolean;
  t: (key: string) => string;
}) {
  const statusLabel = getStatusLabel({ module: 'installmentApproval', status: installment.status, t });
  const paid = Number(installment.installmentPaidAmount ?? installment.paidAmount ?? 0);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-950">{installment.sale.customer.fullName}</p>
          <p className="text-sm text-slate-500">{installment.sale.customer.phone}</p>
          <p className="mt-1 text-sm text-slate-600">
            {t('sales.receipt')}: {installment.sale.receiptNumber}
          </p>
        </div>
        <Link
          href={`/installments/${installment.id}`}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold"
        >
          {t('common.open')}
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-400">{t('sales.installmentColAmount')}</dt>
          <dd className="font-semibold">{formatMoneyKgs(installment.totalAmount)}</dd>
        </div>
        {showFinanced ? (
          <>
            <div>
              <dt className="text-xs text-slate-400">{t('sales.installmentColDownPayment')}</dt>
              <dd className="font-semibold">
                {formatMoneyKgs(installment.downPayment ?? installment.initialPayment)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{t('sales.paidAmount')}</dt>
              <dd className="font-semibold">{formatMoneyKgs(paid)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{t('sales.installmentColFinanced')}</dt>
              <dd className="font-semibold">{formatMoneyKgs(installment.financedAmount)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-xs text-slate-400">{t('sales.paidAmount')}</dt>
            <dd className="font-semibold">{formatMoneyKgs(paid)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-slate-400">{t('sales.installmentColDueDate')}</dt>
          <dd className="font-semibold">{formatCompactDate(installment.dueDate)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-400">{t('common.status')}</dt>
          <dd>{statusLabel}</dd>
        </div>
      </dl>
    </article>
  );
}
