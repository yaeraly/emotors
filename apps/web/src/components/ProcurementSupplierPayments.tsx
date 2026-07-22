'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { ProcurementPaymentInfo, type SupplierAccountFormValue } from '@/components/ProcurementPaymentInfo';
import {
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canEditSupplierPayment,
  canReturnSupplierPaymentToAccountant,
  canReverseSupplierPayment,
  canSendProcurementInvoiceToAccountant,
  canSendSupplierPaymentToCashier,
  canVoidSupplierPayment,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
export type SupplierPayment = {
  id: string;
  sequenceNumber?: number;
  paymentDate: string;
  amountYuan: number;
  exchangeRate: number;
  calculatedAmountKgs?: number;
  approvedAmountKgs?: number;
  actualPaidKgs?: number | null;
  amountKgs: number;
  paymentMethod: string;
  recipientName?: string | null;
  recipientCompany?: string | null;
  bankName?: string | null;
  beneficiaryName?: string | null;
  accountNumber?: string | null;
  swiftCode?: string | null;
  cardholderName?: string | null;
  cardNumberMasked?: string | null;
  paymentInstructions?: string | null;
  paymentDeadline?: string | null;
  intendedFinanceAccountId?: string | null;
  intendedFinanceAccount?: { id: string; name: string; availableBalance?: number } | null;
  actualFinanceAccount?: { id: string; name: string } | null;
  receiptNumber?: string | null;
  transactionNumber?: string | null;
  notes?: string | null;
  accountantComment?: string | null;
  cashierComment?: string | null;
  returnReason?: string | null;
  status: string;
  version?: number;
  accountant?: { fullName: string } | null;
  cashier?: { fullName: string } | null;
  createdBy?: { fullName: string };
  attachments?: Array<{ id: string; fileName: string; fileUrl: string; entityType?: string }>;
  paidAt?: string | null;
  sentToCashierAt?: string | null;
  createdAt?: string;
};

type FinanceAccountOption = {
  id: string;
  name: string;
  accountNumber: string;
  availableBalance: number;
  currentBalance: number;
};

type ProcurementOrderPayments = {
  id: string;
  orderNumber?: string;
  totalYuan: number;
  totalPaidYuan?: number;
  totalPaidKgs?: number;
  remainingYuan?: number;
  requestedPaymentYuan?: number | null;
  weightedAverageYuanRate?: number | null;
  effectiveYuanRate?: number;
  supplierPaymentStatus?: string;
  yuanRateLocked?: boolean;
  hqStockMovementCreatedAt?: string | null;
  supplierInvoiceNumber?: string | null;
  expectedPaymentDate?: string | null;
  invoiceSentToAccountantAt?: string | null;
  invoiceReviewStatus?: string | null;
  note?: string | null;
  supplierPayments?: SupplierPayment[];
  attachments?: Array<{ id: string; fileName: string; fileUrl: string; entityType?: string }>;
};

type Props = {
  order: ProcurementOrderPayments;
  user: User | null;
  onChanged: () => Promise<void>;
};

const paymentMethods = ['QR_CODE', 'BANK_ACCOUNT', 'BANK_CARD', 'CASH', 'OTHER', 'BANK', 'TRANSFER'] as const;
const adjustmentReasons = [
  'BANK_COMMISSION',
  'PAYMENT_SERVICE_COMMISSION',
  'SUPPLIER_AGREED_CORRECTION',
  'CURRENCY_CONVERSION_DIFFERENCE',
  'OTHER',
] as const;

type PaymentForm = {
  amountYuan: string;
  exchangeRate: string;
  approvedAmountKgs: string;
  kgsAdjustmentReason: string;
  kgsAdjustmentComment: string;
  paymentMethod: (typeof paymentMethods)[number];
  recipientName: string;
  recipientCompany: string;
  bankName: string;
  beneficiaryName: string;
  accountNumber: string;
  swiftCode: string;
  cardholderName: string;
  cardNumber: string;
  paymentInstructions: string;
  paymentDeadline: string;
  intendedFinanceAccountId: string;
  accountantComment: string;
  notes: string;
};

const emptyForm = (): PaymentForm => ({
  amountYuan: '',
  exchangeRate: '',
  approvedAmountKgs: '',
  kgsAdjustmentReason: '',
  kgsAdjustmentComment: '',
  paymentMethod: 'BANK_ACCOUNT',
  recipientName: '',
  recipientCompany: '',
  bankName: '',
  beneficiaryName: '',
  accountNumber: '',
  swiftCode: '',
  cardholderName: '',
  cardNumber: '',
  paymentInstructions: '',
  paymentDeadline: '',
  intendedFinanceAccountId: '',
  accountantComment: '',
  notes: '',
});

export function ProcurementSupplierPayments({ order, user, onChanged }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PaymentForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccountOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accountForm, setAccountForm] = useState<SupplierAccountFormValue>({
    paymentMethod: 'BANK_ACCOUNT',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  });
  const [confirmTarget, setConfirmTarget] = useState<SupplierPayment | null>(null);
  const [confirmForm, setConfirmForm] = useState({
    actualPaidKgs: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    financeAccountId: '',
    transactionNumber: '',
    cashierComment: '',
    accountChangeReason: '',
    actualPaidDifferenceReason: '',
  });
  const [returnTarget, setReturnTarget] = useState<SupplierPayment | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [paymentInfoValid, setPaymentInfoValid] = useState(false);

  const canPrepare = canCreateSupplierPayment(user);
  const canEdit = canEditSupplierPayment(user);
  const canSendInvoice = canSendProcurementInvoiceToAccountant(user);
  const canSendCashier = canSendSupplierPaymentToCashier(user);
  const canConfirm = canConfirmSupplierPayment(user);
  const canReturn = canReturnSupplierPaymentToAccountant(user);
  const canVoid = canVoidSupplierPayment(user);
  const canReverse = canReverseSupplierPayment(user);
  const payments = order.supplierPayments ?? [];
  const invoiceAlreadySent = Boolean(order.invoiceSentToAccountantAt);
  const canResubmitInvoice = String(order.invoiceReviewStatus || '').toUpperCase() === 'RETURNED';
  const invoiceSendLocked = invoiceAlreadySent && !canResubmitInvoice;

  const calculatedKgs = useMemo(() => {
    const yuan = Number(form.amountYuan);
    const rate = Number(form.exchangeRate);
    if (!yuan || !rate) return 0;
    return Math.round(yuan * rate * 100) / 100;
  }, [form.amountYuan, form.exchangeRate]);

  useEffect(() => {
    if (!canPrepare && !canConfirm) return;
    void apiFetch<FinanceAccountOption[]>('/procurement/supplier-payment-accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [canPrepare, canConfirm]);

  useEffect(() => {
    if (!form.approvedAmountKgs && calculatedKgs > 0) {
      setForm((current) => ({ ...current, approvedAmountKgs: String(calculatedKgs) }));
    }
  }, [calculatedKgs, form.approvedAmountKgs]);

  async function sendInvoice() {
    if (invoiceSendLocked || saving || !paymentInfoValid) return;
    if (accountForm.paymentMethod === 'BANK_ACCOUNT' && !accountForm.accountNumber.trim()) {
      setError(t('procurement.paymentInfo.accountNumberRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/send-invoice-to-accountant`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: accountForm.paymentMethod,
          bankName: accountForm.bankName || undefined,
          accountHolder: accountForm.accountHolder || undefined,
          accountNumber: accountForm.accountNumber || undefined,
        }),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function openCreateForm() {
    setEditingPaymentId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEditForm(payment: SupplierPayment) {
    setEditingPaymentId(payment.id);
    setForm({
      amountYuan: String(payment.amountYuan ?? ''),
      exchangeRate: String(payment.exchangeRate ?? ''),
      approvedAmountKgs: String(payment.approvedAmountKgs ?? payment.amountKgs ?? ''),
      kgsAdjustmentReason: '',
      kgsAdjustmentComment: '',
      paymentMethod: (payment.paymentMethod as PaymentForm['paymentMethod']) || 'BANK_ACCOUNT',
      recipientName: payment.recipientName ?? '',
      recipientCompany: payment.recipientCompany ?? '',
      bankName: payment.bankName ?? '',
      beneficiaryName: payment.beneficiaryName ?? '',
      accountNumber: payment.accountNumber ?? '',
      swiftCode: payment.swiftCode ?? '',
      cardholderName: payment.cardholderName ?? '',
      cardNumber: '',
      paymentInstructions: payment.paymentInstructions ?? '',
      paymentDeadline: payment.paymentDeadline ? String(payment.paymentDeadline).slice(0, 10) : '',
      intendedFinanceAccountId: payment.intendedFinanceAccountId ?? '',
      accountantComment: payment.accountantComment ?? '',
      notes: payment.notes ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingPaymentId(null);
    setForm(emptyForm());
  }

  async function savePayment(sendToCashier: boolean) {
    setSaving(true);
    setError('');
    try {
      const approved = Number(form.approvedAmountKgs || calculatedKgs);
      const payload = {
        amountYuan: Number(form.amountYuan),
        exchangeRate: Number(form.exchangeRate),
        approvedAmountKgs: approved,
        kgsAdjustmentReason:
          Math.abs(approved - calculatedKgs) > 0.009 ? form.kgsAdjustmentReason || undefined : undefined,
        kgsAdjustmentComment: form.kgsAdjustmentComment || undefined,
        paymentMethod: form.paymentMethod,
        recipientName: form.recipientName || undefined,
        recipientCompany: form.recipientCompany || undefined,
        bankName: form.bankName || undefined,
        beneficiaryName: form.beneficiaryName || undefined,
        accountNumber: form.accountNumber || undefined,
        swiftCode: form.swiftCode || undefined,
        cardholderName: form.cardholderName || undefined,
        cardNumber: form.cardNumber || undefined,
        paymentInstructions: form.paymentInstructions || undefined,
        paymentDeadline: form.paymentDeadline || undefined,
        intendedFinanceAccountId: form.intendedFinanceAccountId || undefined,
        accountantComment: form.accountantComment || undefined,
        notes: form.notes || undefined,
        sendToCashier,
      };
      if (editingPaymentId) {
        await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${editingPaymentId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/procurement/orders/${order.id}/supplier-payments`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      closeForm();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function sendExistingToCashier(paymentId: string) {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${paymentId}/send-to-cashier`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(paymentId: string) {
    if (!window.confirm(t('procurement.payments.confirmVoid'))) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function reversePayment(paymentId: string) {
    const reason = window.prompt(t('procurement.payments.reverseReasonPrompt'));
    if (!reason || reason.trim().length < 3) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${paymentId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadReceipt(paymentId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const formData = new FormData();
    formData.append('file', file);
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        `${API_URL}/procurement/orders/${order.id}/supplier-payments/${paymentId}/attachments`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn() {
    if (!returnTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${returnTarget.id}/return-to-accountant`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      setReturnTarget(null);
      setReturnReason('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitConfirm() {
    if (!confirmTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${confirmTarget.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          actualPaidKgs: Number(confirmForm.actualPaidKgs),
          paymentDate: confirmForm.paymentDate,
          financeAccountId: confirmForm.financeAccountId || undefined,
          transactionNumber: confirmForm.transactionNumber || undefined,
          cashierComment: confirmForm.cashierComment || undefined,
          accountChangeReason: confirmForm.accountChangeReason || undefined,
          actualPaidDifferenceReason: confirmForm.actualPaidDifferenceReason || undefined,
          expectedVersion: confirmTarget.version,
        }),
      });
      setConfirmTarget(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function openConfirm(payment: SupplierPayment) {
    setConfirmTarget(payment);
    setConfirmForm({
      actualPaidKgs: String(payment.approvedAmountKgs ?? payment.amountKgs),
      paymentDate: new Date().toISOString().slice(0, 10),
      financeAccountId: payment.intendedFinanceAccountId ?? '',
      transactionNumber: '',
      cashierComment: '',
      accountChangeReason: '',
      actualPaidDifferenceReason: '',
    });
  }

  const selectedAccount = accounts.find((account) => account.id === form.intendedFinanceAccountId);
  const approvedPreview = Number(form.approvedAmountKgs || calculatedKgs);
  const balanceWarning =
    selectedAccount && approvedPreview > Number(selectedAccount.availableBalance)
      ? t('procurement.payments.balanceWarning')
      : '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold">{t('procurement.payments.title')}</h3>
        {canPrepare ? (
          <button
            type="button"
            onClick={() => (showForm && !editingPaymentId ? closeForm() : openCreateForm())}
            className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-700"
          >
            {showForm && !editingPaymentId ? t('common.cancel') : t('procurement.payments.addPayment')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard label={t('procurement.payments.totalOrderYuan')} value={`¥${Number(order.totalYuan).toFixed(2)}`} />
        <SummaryCard label={t('procurement.payments.totalPaidYuan')} value={`¥${Number(order.totalPaidYuan ?? 0).toFixed(2)}`} />
        <SummaryCard label={t('procurement.payments.remainingYuan')} value={`¥${Number(order.remainingYuan ?? order.totalYuan).toFixed(2)}`} />
        <SummaryCard
          label={t('procurement.payments.paymentStatus')}
          value={t(`procurement.payments.status.${order.supplierPaymentStatus ?? 'UNPAID'}`)}
        />
      </div>

      {canSendInvoice ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-sm font-semibold text-slate-900">{t('procurement.payments.supplierAccountTitle')}</h4>
          {invoiceAlreadySent ? (
            <p className="mt-2 text-sm text-slate-600">
              {t('procurement.payments.invoiceSentStatus')}
              {order.invoiceSentToAccountantAt
                ? `: ${new Date(order.invoiceSentToAccountantAt).toLocaleString()}`
                : ''}
              {order.supplierPaymentStatus
                ? ` · ${t(`procurement.payments.status.${order.supplierPaymentStatus}`)}`
                : ''}
            </p>
          ) : null}
          <div className="mt-2">
            <ProcurementPaymentInfo
              orderId={order.id}
              user={user}
              value={{
                paymentMethod: accountForm.paymentMethod === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT',
                bankName: accountForm.bankName ?? '',
                accountHolder: accountForm.accountHolder ?? '',
                accountNumber: accountForm.accountNumber ?? '',
              }}
              onChange={(next) =>
                setAccountForm({
                  paymentMethod: next.paymentMethod === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT',
                  bankName: next.bankName ?? '',
                  accountHolder: next.accountHolder ?? '',
                  accountNumber: next.accountNumber ?? '',
                })
              }
              onValidityChange={setPaymentInfoValid}
              disabled={invoiceSendLocked}
            />
          </div>
          <button
            type="button"
            disabled={saving || invoiceSendLocked || !paymentInfoValid}
            onClick={() => void sendInvoice()}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
          >
            {invoiceSendLocked
              ? t('procurement.payments.invoiceSentStatus')
              : t('procurement.payments.sendInvoice')}
          </button>
        </div>
      ) : null}

      {showForm && canPrepare ? (
        <div className="mb-6 grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <h4 className="font-semibold text-slate-900">
              {editingPaymentId ? t('procurement.payments.editPayment') : t('procurement.payments.addPayment')}
            </h4>
            {editingPaymentId ? (
              <p className="mt-1 text-sm text-slate-600">{t('procurement.payments.editPaymentHelp')}</p>
            ) : null}
          </div>
          <Field label={t('procurement.payments.amountYuan')} type="number" value={form.amountYuan} onChange={(value) => setForm({ ...form, amountYuan: value, approvedAmountKgs: '' })} />
          <Field label={t('procurement.payments.exchangeRate')} type="number" value={form.exchangeRate} onChange={(value) => setForm({ ...form, exchangeRate: value, approvedAmountKgs: '' })} />
          <Field label={t('procurement.payments.calculatedKgs')} type="number" value={String(calculatedKgs || '')} onChange={() => undefined} />
          <Field label={t('procurement.payments.approvedKgs')} type="number" value={form.approvedAmountKgs} onChange={(value) => setForm({ ...form, approvedAmountKgs: value })} />
          {Math.abs(approvedPreview - calculatedKgs) > 0.009 ? (
            <>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('procurement.payments.adjustmentReason')}</span>
                <select
                  value={form.kgsAdjustmentReason}
                  onChange={(e) => setForm({ ...form, kgsAdjustmentReason: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">{t('common.select')}</option>
                  {adjustmentReasons.map((reason) => (
                    <option key={reason} value={reason}>{t(`procurement.payments.adjustment.${reason}`)}</option>
                  ))}
                </select>
              </label>
              <Field label={t('procurement.payments.adjustmentComment')} value={form.kgsAdjustmentComment} onChange={(value) => setForm({ ...form, kgsAdjustmentComment: value })} />
            </>
          ) : null}
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('procurement.payments.paymentMethod')}</span>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentForm['paymentMethod'] })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{t(`procurement.payments.method.${method}`)}</option>
              ))}
            </select>
          </label>
          <Field label={t('procurement.payments.recipientName')} value={form.recipientName} onChange={(value) => setForm({ ...form, recipientName: value })} />
          <Field label={t('procurement.payments.recipientCompany')} value={form.recipientCompany} onChange={(value) => setForm({ ...form, recipientCompany: value })} />
          {(form.paymentMethod === 'BANK_ACCOUNT' || form.paymentMethod === 'BANK' || form.paymentMethod === 'TRANSFER') ? (
            <>
              <Field label={t('procurement.payments.bankName')} value={form.bankName} onChange={(value) => setForm({ ...form, bankName: value })} />
              <Field label={t('procurement.payments.beneficiaryName')} value={form.beneficiaryName} onChange={(value) => setForm({ ...form, beneficiaryName: value })} />
              <Field label={t('procurement.payments.accountNumber')} value={form.accountNumber} onChange={(value) => setForm({ ...form, accountNumber: value })} />
              <Field label={t('procurement.payments.swiftCode')} value={form.swiftCode} onChange={(value) => setForm({ ...form, swiftCode: value })} />
            </>
          ) : null}
          {form.paymentMethod === 'BANK_CARD' ? (
            <>
              <Field label={t('procurement.payments.cardholderName')} value={form.cardholderName} onChange={(value) => setForm({ ...form, cardholderName: value })} />
              <Field label={t('procurement.payments.cardNumber')} value={form.cardNumber} onChange={(value) => setForm({ ...form, cardNumber: value })} />
            </>
          ) : null}
          {(form.paymentMethod === 'OTHER' || form.paymentMethod === 'QR_CODE') ? (
            <Field label={t('procurement.payments.paymentInstructions')} value={form.paymentInstructions} onChange={(value) => setForm({ ...form, paymentInstructions: value })} />
          ) : null}
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('procurement.payments.financeAccount')}</span>
            <select
              value={form.intendedFinanceAccountId}
              onChange={(e) => setForm({ ...form, intendedFinanceAccountId: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatKgs(account.availableBalance)}
                </option>
              ))}
            </select>
          </label>
          <Field label={t('procurement.payments.paymentDeadline')} type="date" value={form.paymentDeadline} onChange={(value) => setForm({ ...form, paymentDeadline: value })} />
          <Field label={t('procurement.payments.accountantComment')} value={form.accountantComment} onChange={(value) => setForm({ ...form, accountantComment: value })} />
          <Field label={t('procurement.payments.notes')} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          {balanceWarning ? <p className="md:col-span-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{balanceWarning}</p> : null}
          <div className="md:col-span-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void savePayment(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              {saving ? t('common.loading') : t('procurement.payments.saveDraft')}
            </button>
            {canSendCashier ? (
              <button
                type="button"
                disabled={saving || Boolean(balanceWarning)}
                onClick={() => void savePayment(true)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
              >
                {saving ? t('common.loading') : t('procurement.payments.sendToCashier')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={closeForm}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">{t('procurement.payments.sequence')}</th>
              <th className="px-3 py-3">{t('procurement.payments.paymentDate')}</th>
              <th className="px-3 py-3">{t('procurement.payments.amountYuan')}</th>
              <th className="px-3 py-3">{t('procurement.payments.exchangeRate')}</th>
              <th className="px-3 py-3">{t('procurement.payments.actualPaidKgs')}</th>
              <th className="px-3 py-3">{t('procurement.payments.receipt')}</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length ? payments.map((payment) => (
              <tr key={payment.id} className={payment.status === 'VOID' || payment.status === 'REVERSED' ? 'bg-slate-50 text-slate-400' : ''}>
                <td className="px-3 py-3">#{payment.sequenceNumber ?? '-'}</td>
                <td className="px-3 py-3">{new Date(payment.paidAt ?? payment.paymentDate).toLocaleDateString()}</td>
                <td className="px-3 py-3">¥{Number(payment.amountYuan).toFixed(2)}</td>
                <td className="px-3 py-3">{Number(payment.exchangeRate).toFixed(4)}</td>
                <td className="px-3 py-3">{payment.actualPaidKgs != null ? formatKgs(payment.actualPaidKgs) : '-'}</td>
                <td className="px-3 py-3">
                  {payment.attachments?.length ? (
                    <div className="space-y-1">
                      {payment.attachments.map((attachment) => (
                        <a key={attachment.id} href={`${API_URL}${attachment.fileUrl}`} target="_blank" rel="noreferrer" className="block text-blue-700">
                          {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  ) : '-'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (payment.status === 'DRAFT' || payment.status === 'RETURNED') ? (
                      <button type="button" onClick={() => openEditForm(payment)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
                        {t('procurement.payments.editPayment')}
                      </button>
                    ) : null}
                    {canSendCashier && (payment.status === 'DRAFT' || payment.status === 'RETURNED') ? (
                      <button type="button" onClick={() => void sendExistingToCashier(payment.id)} className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700">
                        {t('procurement.payments.sendToCashier')}
                      </button>
                    ) : null}
                    {canConfirm && payment.status === 'PENDING_CASHIER' ? (
                      <>
                        <label className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                          {t('procurement.payments.uploadReceipt')}
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => void uploadReceipt(payment.id, e)} />
                        </label>
                        <button type="button" onClick={() => openConfirm(payment)} className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                          {t('procurement.payments.confirmPayment')}
                        </button>
                      </>
                    ) : null}
                    {canReturn && payment.status === 'PENDING_CASHIER' ? (
                      <button type="button" onClick={() => { setReturnTarget(payment); setReturnReason(''); }} className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800">
                        {t('procurement.payments.returnToAccountant')}
                      </button>
                    ) : null}
                    {canVoid && ['DRAFT', 'RETURNED', 'PENDING_CASHIER', 'CANCELLED'].includes(payment.status) ? (
                      <button type="button" onClick={() => void voidPayment(payment.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                        {t('procurement.payments.voidPayment')}
                      </button>
                    ) : null}
                    {canReverse && payment.status === 'ACTIVE' ? (
                      <button type="button" onClick={() => void reversePayment(payment.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                        {t('procurement.payments.reversePayment')}
                      </button>
                    ) : null}
                    {payment.returnReason ? (
                      <span className="text-xs text-amber-800">{payment.returnReason}</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>{t('procurement.payments.noPayments')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('procurement.payments.confirmPayment')}</h4>
            <p className="mt-2 text-sm text-slate-500">
              #{confirmTarget.sequenceNumber} · ¥{Number(confirmTarget.amountYuan).toFixed(2)} · {t('procurement.payments.exchangeRate')}: {Number(confirmTarget.exchangeRate).toFixed(4)}
            </p>
            <div className="mt-5 space-y-4">
              <Field label={t('procurement.payments.actualPaidKgs')} type="number" value={confirmForm.actualPaidKgs} onChange={(value) => setConfirmForm({ ...confirmForm, actualPaidKgs: value })} />
              <Field label={t('procurement.payments.paymentDate')} type="date" value={confirmForm.paymentDate} onChange={(value) => setConfirmForm({ ...confirmForm, paymentDate: value })} />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('procurement.payments.financeAccount')}</span>
                <select
                  value={confirmForm.financeAccountId}
                  onChange={(e) => setConfirmForm({ ...confirmForm, financeAccountId: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">{t('common.select')}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {formatKgs(account.availableBalance)}
                    </option>
                  ))}
                </select>
              </label>
              {confirmForm.financeAccountId && confirmForm.financeAccountId !== confirmTarget.intendedFinanceAccountId ? (
                <Field label={t('procurement.payments.accountChangeReason')} value={confirmForm.accountChangeReason} onChange={(value) => setConfirmForm({ ...confirmForm, accountChangeReason: value })} />
              ) : null}
              {Math.abs(Number(confirmForm.actualPaidKgs || 0) - Number(confirmTarget.approvedAmountKgs ?? confirmTarget.amountKgs)) > 0.009 ? (
                <Field label={t('procurement.payments.differenceReason')} value={confirmForm.actualPaidDifferenceReason} onChange={(value) => setConfirmForm({ ...confirmForm, actualPaidDifferenceReason: value })} />
              ) : null}
              <Field label={t('procurement.payments.transactionNumber')} value={confirmForm.transactionNumber} onChange={(value) => setConfirmForm({ ...confirmForm, transactionNumber: value })} />
              <Field label={t('procurement.payments.notes')} value={confirmForm.cashierComment} onChange={(value) => setConfirmForm({ ...confirmForm, cashierComment: value })} />
              <p className="text-sm text-amber-800">{t('procurement.payments.receiptRequiredHint')}</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setConfirmTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('common.cancel')}</button>
                <button type="button" disabled={saving} onClick={() => void submitConfirm()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-blue-300">
                  {saving ? t('common.loading') : t('procurement.payments.confirmPayment')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {returnTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('procurement.payments.returnToAccountant')}</h4>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="mt-4 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder={t('procurement.payments.returnReason')}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setReturnTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('common.cancel')}</button>
              <button type="button" disabled={saving || returnReason.trim().length < 3} onClick={() => void submitReturn()} className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white disabled:bg-amber-300">
                {saving ? t('common.loading') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        step={type === 'number' ? '0.0001' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={label.includes('Рассчитан') || label.toLowerCase().includes('calculated')}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 read-only:bg-slate-100"
      />
    </label>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
