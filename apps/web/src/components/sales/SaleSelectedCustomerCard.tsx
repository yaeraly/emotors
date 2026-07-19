'use client';

import type { SaleCustomerOption } from '@/components/SaleCustomerSearch';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  customer: SaleCustomerOption;
  onRemove?: () => void;
  removeLabel?: string;
  readOnly?: boolean;
};

export function SaleSelectedCustomerCard({ customer, onRemove, removeLabel, readOnly = false }: Props) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 rounded-2xl border border-blue-100 bg-blue-50 p-4 lg:min-w-72">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            {t('sales.customerSelected')}
          </p>
          <p className="mt-2 truncate text-lg font-bold text-slate-950">{customer.fullName}</p>
          <p className="mt-1 text-sm text-slate-700">{customer.phone}</p>
          <p className="mt-2 text-sm text-slate-600">{t(`status.${customer.status}`)}</p>
          {customer.totalDebtAmount > 0 ? (
            <p className="mt-2 text-sm font-medium text-amber-700">
              {t('sales.debtAmount')}: {customer.totalDebtAmount.toLocaleString('ru-RU')} сом
            </p>
          ) : null}
        </div>
        {!readOnly && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-white"
        >
          {removeLabel ?? t('sales.removeCustomer')}
        </button>
        ) : null}
      </div>
    </div>
  );
}
