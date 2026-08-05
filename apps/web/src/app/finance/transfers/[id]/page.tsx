'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { InvoiceReceiptHistoryPanel } from '@/components/InvoiceReceiptHistoryPanel';
import { API_URL, apiFetch } from '@/lib/api';
import {
  buildTransferStatusHistory,
  formatTransferField,
} from '@/lib/finance-transfer-detail';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceTransfer } from '@/lib/types';

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-900">{children}</div>
    </div>
  );
}

export default function FinanceTransferDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<FinanceTransfer | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<FinanceTransfer>(`/finance/transfers/${params.id}`)
      .then((row) => {
        setTransfer(row);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [params.id, t]);

  const statusHistory = useMemo(
    () => (transfer ? buildTransferStatusHistory(transfer) : []),
    [transfer],
  );

  const emptyValue = t('hqWarehouse.notSpecified');

  return (
    <FinanceLayout
      titleKey="finance.transfer"
      breadcrumbs={[
        { href: '/finance/transfers', labelKey: 'finance.transfers' },
        { labelKey: 'finance.transfer' },
      ]}
    >
      <div className="mb-4">
        <Link
          href="/finance/transfers"
          className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t('common.back')}
        </Link>
      </div>

      {error ? <FinanceErrorState message={error} /> : null}
      {loading ? <FinanceLoadingState /> : null}

      {!loading && transfer ? (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <DetailField label={t('finance.transferNumber')}>{transfer.transferNumber}</DetailField>
            <DetailField label={t('finance.createdAt')}>
              {transfer.createdAt
                ? new Date(transfer.createdAt).toLocaleString('ru-RU')
                : new Date(transfer.transferDate).toLocaleString('ru-RU')}
            </DetailField>
            <DetailField label={t('distribution.status')}>
              {t(`finance.transferStatus.${transfer.status}`)}
            </DetailField>
            <DetailField label={t('finance.sourceAccount')}>{transfer.sourceAccount.name}</DetailField>
            <DetailField label={t('finance.destinationAccount')}>{transfer.destinationAccount.name}</DetailField>
            <DetailField label={t('finance.amount')}>
              <FinanceMoney amount={Number(transfer.amount)} currency={transfer.currency} />
            </DetailField>
            <DetailField label={t('finance.currency')}>{transfer.currency}</DetailField>
            <DetailField label={t('finance.transferReceipt')}>
              {transfer.receipts?.length ? (
                <div className="space-y-1">
                  {transfer.receipts.map((receipt) => (
                    <a
                      key={receipt.id}
                      href={`${API_URL}${receipt.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-blue-700 hover:underline"
                    >
                      {receipt.fileName}
                    </a>
                  ))}
                </div>
              ) : (
                '—'
              )}
            </DetailField>
            <DetailField label={t('finance.transactionNumber')}>
              {formatTransferField(transfer.transactionNumber)}
            </DetailField>
            <DetailField label={t('finance.comment')}>
              <span className="whitespace-pre-wrap break-words">
                {formatTransferField(transfer.notes ?? transfer.reason, emptyValue)}
              </span>
            </DetailField>
            <DetailField label={t('finance.transferCashier')}>
              {formatTransferField(transfer.cashier?.fullName, emptyValue)}
            </DetailField>
            <DetailField label={t('finance.transferAccountant')}>
              {formatTransferField(transfer.accountant?.fullName, emptyValue)}
            </DetailField>
            <DetailField label={t('finance.createdBy')}>
              {formatTransferField(transfer.createdBy?.fullName, emptyValue)}
            </DetailField>
            <DetailField label={t('finance.approvedBy')}>
              {formatTransferField(transfer.approvedBy?.fullName, emptyValue)}
            </DetailField>
            <DetailField label={t('finance.approvedAt')}>
              {transfer.approvedAt
                ? new Date(transfer.approvedAt).toLocaleString('ru-RU')
                : '—'}
            </DetailField>
            <DetailField label={t('finance.transferReturnReason')}>
              <span className="whitespace-pre-wrap break-words">
                {formatTransferField(transfer.returnReason, '—')}
              </span>
            </DetailField>
          </section>

          {statusHistory.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">{t('finance.statusHistory')}</h3>
              <ol className="mt-4 space-y-3">
                {statusHistory.map((item, index) => (
                  <li key={`${item.at}-${item.status}-${index}`} className="rounded-2xl border border-slate-100 px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-semibold text-slate-900">{t(item.labelKey)}</p>
                      <p className="text-sm text-slate-500">{new Date(item.at).toLocaleString('ru-RU')}</p>
                    </div>
                    {item.detail ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <InvoiceReceiptHistoryPanel
            source="FINANCE_TRANSFER"
            entityId={transfer.id}
          />
        </div>
      ) : null}
    </FinanceLayout>
  );
}
