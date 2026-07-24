'use client';

import {
  getProcurementStatusButtonState,
  isStatusActionDisabled,
  PROCUREMENT_STATUS_WORKFLOW,
  statusButtonClassName,
  type StatusButtonVisualState,
} from '@/lib/procurement-status-workflow';
import {
  getSupplierPaymentProgressStepState,
  getSupplierPaymentStatusTranslationKey,
  type SupplierPaymentDisplayStatus,
} from '@/lib/supplier-payment-utils';
import { useTranslation } from '@/i18n/useTranslation';

const CANCEL_ACTION = { path: 'cancel' as const, status: 'CANCELLED' as const };

type Props = {
  orderStatus: string;
  supplierPaymentStatus: SupplierPaymentDisplayStatus;
  onAction: (path: string) => void;
};

function statusHintKey(state: StatusButtonVisualState) {
  switch (state) {
    case 'current':
      return 'procurement.statusButtons.currentStatus';
    case 'completed':
      return 'procurement.statusButtons.completed';
    case 'next':
      return 'procurement.statusButtons.nextStep';
    case 'unavailable':
      return 'procurement.statusButtons.unavailable';
    default:
      return null;
  }
}

export function ProcurementStatusButtons({ orderStatus, supplierPaymentStatus, onAction }: Props) {
  const { t } = useTranslation();

  const actions = [
    ...PROCUREMENT_STATUS_WORKFLOW.map((entry) => {
      const isPaymentStep = entry.path === 'mark-paid';
      const state = isPaymentStep
        ? getSupplierPaymentProgressStepState(supplierPaymentStatus)
        : getProcurementStatusButtonState(orderStatus, entry);

      return {
        path: entry.path,
        label: isPaymentStep
          ? t(getSupplierPaymentStatusTranslationKey(supplierPaymentStatus))
          : t(workflowLabelKey(entry.path)),
        state,
        readOnly: isPaymentStep,
      };
    }),
    {
      path: CANCEL_ACTION.path,
      label: t('distribution.cancel'),
      state: getProcurementStatusButtonState(orderStatus, CANCEL_ACTION),
      readOnly: false,
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const hintKey = statusHintKey(action.state);
        const disabled = isStatusActionDisabled(action.state) || action.readOnly;
        return (
          <button
            key={action.path}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (action.readOnly || isStatusActionDisabled(action.state)) return;
              onAction(action.path);
            }}
            title={
              action.readOnly && action.state !== 'current' && action.state !== 'completed'
                ? t('procurement.statusButtons.paidReadOnly')
                : hintKey
                  ? t(hintKey)
                  : undefined
            }
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${statusButtonClassName(action.state)} ${action.state === 'current' ? 'font-bold' : ''}`}
          >
            {(action.state === 'completed' || action.state === 'current') ? (
              <span aria-hidden="true">✓</span>
            ) : null}
            <span>{action.label}</span>
            {action.state === 'current' ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {t('procurement.statusButtons.currentStatus')}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function workflowLabelKey(path: string) {
  switch (path) {
    case 'approve':
      return 'distribution.approve';
    case 'mark-ordered':
      return 'procurement.orders.markOrdered';
    case 'mark-sent-to-supplier':
      return 'procurement.orders.markSentToSupplier';
    case 'mark-paid':
      return 'paymentStatus.PAID';
    case 'mark-production':
      return 'procurement.inProduction';
    case 'mark-shipped-to-yiwu':
      return 'procurement.shippedToYiwu';
    case 'mark-in-transit':
      return 'procurement.inTransit';
    case 'mark-arrived':
      return 'procurement.markArrived';
    default:
      return path;
  }
}
