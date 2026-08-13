'use client';

import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type InvoiceReceipt = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { id: string; fullName: string } | null;
  processedAt: string | null;
  invoiceStatus: string;
  paymentId: string;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  paymentMethod: string | null;
};

type InvoiceReceiptResponse = {
  source: string;
  entityId: string;
  paymentId: string | null;
  invoiceNumber: string;
  invoiceStatus: string;
  processedAt: string | null;
  receipts: InvoiceReceipt[];
};

type Props = {
  source: 'SUPPLIER_PAYMENT' | 'TRANSPORT_EXPENSE' | 'FINANCE_TRANSFER';
  entityId: string;
  paymentId?: string;
  title?: string;
  id?: string;
};

export function InvoiceReceiptHistoryPanel({
  source,
  entityId,
  paymentId,
  title,
  id = 'invoice-receipts',
}: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<InvoiceReceiptResponse | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ source, entityId });
    if (paymentId) params.set('paymentId', paymentId);
    apiFetch<InvoiceReceiptResponse>(`/procurement/invoice-receipts?${params.toString()}`)
      .then(setData)
      .catch(() => setData(null));
  }, [source, entityId, paymentId]);

  if (!data?.receipts?.length) return null;

  async function openReceipt(receiptId: string, fileUrl: string) {
    try {
      await apiFetch(`/procurement/invoice-receipts/${receiptId}/view`, { method: 'POST' });
    } catch {
      // View audit is best-effort; still allow open when authorized.
    }
    window.open(`${API_URL}${fileUrl}`, '_blank', 'noopener,noreferrer');
  }

  async function downloadReceipt(receiptId: string, fileUrl: string, fileName: string) {
    try {
      await apiFetch(`/procurement/invoice-receipts/${receiptId}/download`, { method: 'POST' });
    } catch {
      // Download audit is best-effort.
    }
    const link = document.createElement('a');
    link.href = `${API_URL}${fileUrl}`;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  }

  function formatAmount(receipt: InvoiceReceipt) {
    if (receipt.paymentAmount == null) return '—';
    return `${receipt.paymentAmount.toLocaleString('ru-RU')} ${receipt.paymentCurrency ?? 'KGS'}`;
  }

  return (
    <section id={id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">
        {title ?? t('procurement.invoiceReceipts.title')}
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.uploadedAt')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.paymentAmount')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.paymentMethod')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.uploadedBy')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.receipt')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.invoiceStatus')}</th>
              <th className="px-3 py-2">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {data.receipts.map((receipt) => (
              <tr key={receipt.id} className="border-t border-slate-100">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(receipt.uploadedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatAmount(receipt)}</td>
                <td className="px-3 py-2">{receipt.paymentMethod ?? '—'}</td>
                <td className="px-3 py-2">{receipt.uploadedBy?.fullName ?? '—'}</td>
                <td className="px-3 py-2">{receipt.fileName}</td>
                <td className="px-3 py-2">{receipt.invoiceStatus}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => void openReceipt(receipt.id, receipt.fileUrl)}
                    className="mr-2 font-medium text-blue-700 hover:underline"
                  >
                    {t('procurement.invoiceReceipts.open')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadReceipt(receipt.id, receipt.fileUrl, receipt.fileName)}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {t('procurement.invoiceReceipts.download')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
