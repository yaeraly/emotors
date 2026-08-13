'use client';

import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { PERMANENT_DELETE_CONFIRM_PHRASE } from '@/lib/permanent-delete';
import { useTranslation } from '@/i18n/useTranslation';

export type HqPaymentDeleteSummary = {
  paymentNumber: string;
  amount: string;
  currency: string;
  paymentDate?: string | null;
  accountOrCashbox?: string | null;
  payer?: string | null;
  recipient?: string | null;
};

type Props = {
  open: boolean;
  payment: HqPaymentDeleteSummary | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
};

export function HqPaymentPermanentDeleteModal({
  open,
  payment,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  const message = payment
    ? [
        t('finance.paymentPermanentDelete.message'),
        '',
        `${t('finance.paymentPermanentDelete.paymentNumber')}: ${payment.paymentNumber}`,
        `${t('finance.cashierBills.amount')}: ${payment.amount} ${payment.currency}`,
        `${t('finance.paymentPermanentDelete.paymentDate')}: ${payment.paymentDate || '—'}`,
        `${t('finance.billsToPay.accountOrCashbox')}: ${payment.accountOrCashbox || '—'}`,
        `${t('finance.paymentPermanentDelete.payer')}: ${payment.payer || '—'}`,
        `${t('finance.paymentPermanentDelete.recipient')}: ${payment.recipient || '—'}`,
      ].join('\n')
    : t('finance.paymentPermanentDelete.message');

  return (
    <DeleteConfirmModal
      open={open && !!payment}
      title={t('finance.paymentPermanentDelete.title')}
      message={message}
      confirmPhrase={PERMANENT_DELETE_CONFIRM_PHRASE}
      confirmPhraseLabel={t('common.permanentDeleteTypeConfirm')}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
