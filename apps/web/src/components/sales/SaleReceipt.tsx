'use client';

import { createPortal } from 'react-dom';
import type { Sale } from '@/lib/types';
import { formatPaymentMethodLabel } from '@/lib/sale-payment-methods';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  sale: Sale;
  onPrint?: () => void;
};

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} сом`;
}

function activePayments(sale: Sale) {
  return (sale.payments ?? []).filter((payment) => payment.status !== 'VOID');
}

function primaryPaymentMethod(sale: Sale) {
  const payments = activePayments(sale);
  return payments[0]?.method ?? null;
}

function ReceiptBody({
  sale,
  copyLabel,
}: {
  sale: Sale;
  copyLabel?: string;
}) {
  const { t } = useTranslation();
  const method = primaryPaymentMethod(sale);
  const isInstallment = Boolean(sale.installmentApproval);

  return (
    <div className="sale-receipt-copy">
      {copyLabel ? <p className="sale-receipt-copy-label">{copyLabel}</p> : null}
      <p className="sale-receipt-brand">EMOTORS</p>
      <p className="sale-receipt-branch">{sale.branch?.name ?? ''}</p>
      <p className="sale-receipt-title">{t('sales.receipt')}</p>
      <p className="sale-receipt-meta">
        {t('sales.receiptNumber')}: {sale.receiptNumber}
      </p>
      <p className="sale-receipt-meta">
        {new Date(sale.saleDate).toLocaleString('ru-RU')}
      </p>
      <p className="sale-receipt-meta">
        {t('sales.customer')}: {sale.customer?.fullName}
      </p>
      <p className="sale-receipt-meta">
        {t('sales.seller')}: {sale.seller?.fullName}
      </p>
      <table className="sale-receipt-items">
        <thead>
          <tr>
            <th>{t('sales.product')}</th>
            <th>{t('sales.quantity')}</th>
            <th>{t('sales.unitPrice')}</th>
            <th>{t('sales.totalAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((item) => (
            <tr key={item.id}>
              <td>{item.productName}</td>
              <td>{item.quantity}</td>
              <td>{formatKgs(item.unitPrice)}</td>
              <td>{formatKgs(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sale-receipt-totals">
        <p>
          <span>{t('sales.totalAmount')}</span>
          <strong>{formatKgs(sale.totalAmount)}</strong>
        </p>
        <p>
          <span>{t('sales.paidAmount')}</span>
          <strong>{formatKgs(sale.paidAmount)}</strong>
        </p>
        {Number(sale.debtAmount) > 0.009 ? (
          <p>
            <span>{t('sales.debtAmount')}</span>
            <strong>{formatKgs(sale.debtAmount)}</strong>
          </p>
        ) : null}
        {method ? (
          <p>
            <span>{t('sales.paymentMethod')}</span>
            <strong>{formatPaymentMethodLabel(method, t)}</strong>
          </p>
        ) : null}
        {isInstallment ? (
          <p>
            <span>{t('sales.installment')}</span>
            <strong>{t('sales.installment')}</strong>
          </p>
        ) : null}
      </div>
      <p className="sale-receipt-footer">{t('sales.receiptThankYou')}</p>
    </div>
  );
}

export function SaleReceipt({ sale, onPrint }: Props) {
  const { t } = useTranslation();

  function handlePrint() {
    document.body.classList.add('sale-receipt-print-mode');
    const cleanup = () => {
      document.body.classList.remove('sale-receipt-print-mode');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  }

  return (
    <>
      <section className="sale-receipt-section w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-950">{t('sales.receipt')}</h3>
          <button
            onClick={handlePrint}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
          >
            {t('sales.printReceipt')}
          </button>
        </div>

        <div className="sale-receipt-screen mt-4 w-full min-w-0 border border-slate-200 bg-white p-5">
          <ReceiptBody sale={sale} />
        </div>
      </section>

      {typeof document !== 'undefined'
        ? createPortal(
            <div className="sale-receipt-print-area" aria-hidden="true">
              <div className="sale-receipt-print-sheet">
                <ReceiptBody sale={sale} copyLabel={t('sales.receiptCopyCustomer')} />
                <ReceiptBody sale={sale} copyLabel={t('sales.receiptCopyCompany')} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
