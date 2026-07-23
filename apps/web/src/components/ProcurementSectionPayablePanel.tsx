'use client';

import { ChangeEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { EntityCombobox } from '@/components/EntityCombobox';
import { useTranslation } from '@/i18n/useTranslation';
import type { User } from '@/lib/types';
import {
  canConfirmSupplierPayment,
  canCreateProcurementOrder,
  canCreateSupplierPayment,
  hasFullAccess,
} from '@/lib/rbac';
import { translateStatus } from '@/lib/translate-status';

type QrCode = {
  id: string;
  fileName: string;
  fileUrl: string;
};

type TransportCompany = {
  id: string;
  name: string;
  companyCode?: string;
  contactPerson?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  accountHolder?: string | null;
  status?: string;
  qrAttachments?: QrCode[];
};

type SectionExpense = {
  id: string;
  expenseNumber: string;
  expenseType: string;
  supplierCarrier: string;
  transportCompanyId?: string | null;
  transportCompany?: TransportCompany | null;
  expenseName?: string | null;
  recipientName?: string | null;
  paymentMethod: 'BANK_ACCOUNT' | 'QR_CODE';
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  amount: number;
  currency: string;
  exchangeRate?: number | null;
  amountKgs: number;
  paidAmountKgs?: number;
  totalWeightKg?: number | null;
  cargoRateUsdPerKg?: number | null;
  usdExchangeRate?: number | null;
  calculatedAmountUsd?: number | null;
  calculatedAmountKgs?: number | null;
  status: string;
  returnReason?: string | null;
  accountantComment?: string | null;
  comment?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  createdBy?: { id?: string; fullName?: string } | null;
  accountant?: { fullName?: string } | null;
  cashier?: { fullName?: string } | null;
  invoices?: Array<{ id: string; fileName: string; fileUrl: string }>;
  receipts?: Array<{ id: string; fileName: string; fileUrl: string }>;
  cargoReceipts?: Array<{ id: string; fileName: string; fileUrl: string }>;
  qrCodes?: QrCode[];
};

type Props = {
  orderId: string;
  user: User | null;
  expenseType:
    | 'DOMESTIC_CHINA_TRANSPORT'
    | 'INTERNATIONAL_FREIGHT'
    | 'LOCAL_DELIVERY'
    | 'OTHER_LOGISTICS';
  requestType:
    | 'CHINA_DOMESTIC_TRANSPORT'
    | 'CARGO_PAYMENT'
    | 'KYRGYZSTAN_DOMESTIC_TRANSPORT'
    | 'OTHER_EXPENSE';
  defaultCurrency?: string;
  showExpenseName?: boolean;
  /** Optional outer section heading; omitted when the panel has nothing to show for SM. */
  headingKey?: string;
};

const LOCKED_STATUSES = new Set([
  'WAITING_ACCOUNTANT',
  'UNDER_REVIEW',
  'PENDING_CASHIER',
  'PARTIALLY_PAID',
  'PAID',
  'REJECTED',
]);
const EDITABLE_STATUSES = new Set(['DRAFT', 'RETURNED']);

function mapUiInvoiceStatus(status: string): string {
  switch (status) {
    case 'WAITING_ACCOUNTANT':
    case 'UNDER_REVIEW':
      return 'SENT_TO_ACCOUNTANT';
    case 'RETURNED':
      return 'RETURNED_FOR_CORRECTION';
    case 'PENDING_CASHIER':
      return 'SENT_TO_CASHIER';
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID';
    case 'PAID':
      return 'PAID';
    case 'REJECTED':
      return 'REJECTED';
    case 'DRAFT':
      return 'DRAFT';
    default:
      return status;
  }
}

function roundMoney2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateCargoLocal(weight: string, rate: string, fx: string) {
  const totalWeightKg = Number(weight);
  const cargoRateUsdPerKg = Number(rate);
  const usdExchangeRate = Number(fx);
  if (!(totalWeightKg > 0) || !(cargoRateUsdPerKg > 0) || !(usdExchangeRate > 0)) {
    return { calculatedAmountUsd: '', calculatedAmountKgs: '' };
  }
  const calculatedAmountUsd = roundMoney2(totalWeightKg * cargoRateUsdPerKg);
  const calculatedAmountKgs = roundMoney2(calculatedAmountUsd * usdExchangeRate);
  return {
    calculatedAmountUsd: calculatedAmountUsd.toFixed(2),
    calculatedAmountKgs: calculatedAmountKgs.toFixed(2),
  };
}

export function ProcurementSectionPayablePanel({
  orderId,
  user,
  expenseType,
  requestType,
  defaultCurrency = 'KGS',
  showExpenseName = false,
  headingKey,
}: Props) {
  const { t } = useTranslation();
  const canCreate = canCreateProcurementOrder(user) || hasFullAccess(user);
  const canApprove = canCreateSupplierPayment(user);
  const canConfirm = canConfirmSupplierPayment(user);
  /** Supply Manager (create-only) must not see post-submit invoice/status UI. */
  const isCreatorOnlyView = canCreate && !canApprove && !canConfirm;
  const isCargo = expenseType === 'INTERNATIONAL_FREIGHT';
  const usesTransportCompany = expenseType !== 'OTHER_LOGISTICS';
  const [rows, setRows] = useState<SectionExpense[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [companies, setCompanies] = useState<TransportCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<TransportCompany | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingQrFiles, setPendingQrFiles] = useState<File[]>([]);
  const [pendingInvoice, setPendingInvoice] = useState<File | null>(null);
  const [pendingCargoReceipt, setPendingCargoReceipt] = useState<File | null>(null);
  const [touchedPaymentFields, setTouchedPaymentFields] = useState({
    bankName: false,
    accountHolder: false,
    accountNumber: false,
  });
  const [form, setForm] = useState({
    expenseName: '',
    amount: '',
    currency: defaultCurrency,
    paymentMethod: 'QR_CODE' as 'BANK_ACCOUNT' | 'QR_CODE',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    totalWeightKg: '',
    cargoRateUsdPerKg: '',
    usdExchangeRate: '',
  });
  const [approveTarget, setApproveTarget] = useState<SectionExpense | null>(null);
  const [approveForm, setApproveForm] = useState({ exchangeRate: '', financeAccountId: '', accountantComment: '' });
  const [confirmTarget, setConfirmTarget] = useState<SectionExpense | null>(null);
  const [confirmForm, setConfirmForm] = useState({
    financeAccountId: '',
    transactionNumber: '',
    cashierComment: '',
    paidAmountKgs: '',
  });
  const [returnTarget, setReturnTarget] = useState<SectionExpense | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const sectionRows = useMemo(
    () => rows.filter((row) => row.expenseType === expenseType && row.status !== 'CANCELLED'),
    [rows, expenseType],
  );
  const primaryExpense = useMemo(() => {
    if (!sectionRows.length) return null;
    const ranked = [...sectionRows].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.submittedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.submittedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    return (
      ranked.find((row) => LOCKED_STATUSES.has(row.status) || row.status === 'RETURNED') ||
      ranked.find((row) => row.status === 'DRAFT') ||
      ranked[0]
    );
  }, [sectionRows]);
  const isFormEditable =
    canCreate && (!primaryExpense || EDITABLE_STATUSES.has(primaryExpense.status));
  const isFormLocked = Boolean(primaryExpense && LOCKED_STATUSES.has(primaryExpense.status));
  const isReturned = primaryExpense?.status === 'RETURNED';
  const showExpenseList = canApprove || canConfirm;
  const showSubmissionSummary = Boolean(
    !isCreatorOnlyView &&
      primaryExpense &&
      (primaryExpense.submittedAt || primaryExpense.status !== 'DRAFT'),
  );

  const cargoTotals = useMemo(
    () => calculateCargoLocal(form.totalWeightKg, form.cargoRateUsdPerKg, form.usdExchangeRate),
    [form.totalWeightKg, form.cargoRateUsdPerKg, form.usdExchangeRate],
  );

  const formValid = useMemo(() => {
    if (usesTransportCompany && !selectedCompany?.id && !primaryExpense?.transportCompanyId) {
      return false;
    }
    if (isCargo) {
      if (
        !(Number(form.totalWeightKg) > 0) ||
        !(Number(form.cargoRateUsdPerKg) > 0) ||
        !(Number(form.usdExchangeRate) > 0)
      ) {
        return false;
      }
      const hasCargoReceipt =
        Boolean(pendingCargoReceipt) || Boolean(primaryExpense?.cargoReceipts?.length);
      if (!hasCargoReceipt) return false;
    } else if (!(Number(form.amount) > 0)) {
      return false;
    }
    if (form.paymentMethod === 'BANK_ACCOUNT' && !form.accountNumber.trim()) {
      return false;
    }
    if (form.paymentMethod === 'QR_CODE') {
      const companyQrCount = selectedCompany?.qrAttachments?.length ?? 0;
      const hasQr =
        pendingQrFiles.length > 0 ||
        Boolean(primaryExpense?.qrCodes?.length) ||
        companyQrCount > 0;
      if (!hasQr) return false;
    }
    return true;
  }, [
    form,
    isCargo,
    pendingCargoReceipt,
    pendingQrFiles.length,
    primaryExpense,
    selectedCompany,
    usesTransportCompany,
  ]);

  function load() {
    apiFetch<SectionExpense[]>(`/procurement/transport-expenses?orderId=${orderId}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadCompanies(q = '') {
    const query = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : '';
    return apiFetch<TransportCompany[]>(`/procurement/transport-companies?selectable=true${query}`)
      .then((list) => {
        setCompanies(list);
        return list;
      })
      .catch(() => {
        setCompanies([]);
        return [] as TransportCompany[];
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, expenseType]);

  useEffect(() => {
    if (!usesTransportCompany || !canCreate) return;
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesTransportCompany, canCreate]);

  useEffect(() => {
    if (!canApprove && !canConfirm) return;
    void apiFetch<Array<{ id: string; name: string }>>('/procurement/supplier-payment-accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [canApprove, canConfirm]);

  useEffect(() => {
    if (!primaryExpense || !EDITABLE_STATUSES.has(primaryExpense.status)) return;
    setForm({
      expenseName: primaryExpense.expenseName || primaryExpense.recipientName || '',
      amount: String(primaryExpense.amount || ''),
      currency: primaryExpense.currency || defaultCurrency,
      paymentMethod: primaryExpense.paymentMethod === 'BANK_ACCOUNT' ? 'BANK_ACCOUNT' : 'QR_CODE',
      bankName: primaryExpense.bankName || '',
      accountHolder: primaryExpense.accountHolder || '',
      accountNumber: primaryExpense.accountNumber || '',
      totalWeightKg:
        primaryExpense.totalWeightKg != null ? String(primaryExpense.totalWeightKg) : '',
      cargoRateUsdPerKg:
        primaryExpense.cargoRateUsdPerKg != null ? String(primaryExpense.cargoRateUsdPerKg) : '',
      usdExchangeRate:
        primaryExpense.usdExchangeRate != null ? String(primaryExpense.usdExchangeRate) : '',
    });
    if (primaryExpense.transportCompany) {
      setSelectedCompany(primaryExpense.transportCompany);
    } else if (primaryExpense.transportCompanyId) {
      const match = companies.find((c) => c.id === primaryExpense.transportCompanyId);
      if (match) setSelectedCompany(match);
    }
    setPendingQrFiles([]);
    setPendingInvoice(null);
    setPendingCargoReceipt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryExpense?.id, primaryExpense?.status, primaryExpense?.updatedAt]);

  function applyCompanyToForm(company: TransportCompany, preserveTouched = true) {
    setSelectedCompany(company);
    setForm((current) => ({
      ...current,
      bankName:
        preserveTouched && touchedPaymentFields.bankName
          ? current.bankName
          : current.bankName.trim()
            ? current.bankName
            : company.bankName || '',
      accountHolder:
        preserveTouched && touchedPaymentFields.accountHolder
          ? current.accountHolder
          : current.accountHolder.trim()
            ? current.accountHolder
            : company.accountHolder || '',
      accountNumber:
        preserveTouched && touchedPaymentFields.accountNumber
          ? current.accountNumber
          : current.accountNumber.trim()
            ? current.accountNumber
            : company.bankAccount || '',
    }));
  }

  async function uploadQrToExpense(expenseId: string, file: File) {
    const token = getToken();
    if (!token) throw new Error(t('common.error'));
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${API_URL}/procurement/transport-expenses/${expenseId}/attachments/qr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || t('common.error'));
    }
  }

  async function uploadInvoiceToExpense(expenseId: string, file: File) {
    const token = getToken();
    if (!token) throw new Error(t('common.error'));
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(
      `${API_URL}/procurement/transport-expenses/${expenseId}/attachments/invoice`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || t('common.error'));
    }
  }

  async function uploadCargoReceiptToExpense(expenseId: string, file: File) {
    const token = getToken();
    if (!token) throw new Error(t('common.error'));
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(
      `${API_URL}/procurement/transport-expenses/${expenseId}/attachments/cargo-receipt`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || t('common.error'));
    }
  }

  async function cloneCompanyQr(expenseId: string, companyId: string) {
    await apiFetch(`/procurement/transport-expenses/${expenseId}/attachments/qr-from-company`, {
      method: 'POST',
      body: JSON.stringify({ transportCompanyId: companyId }),
    });
  }

  async function sendToAccountant() {
    if (!canCreate || saving || isFormLocked || !formValid) return;
    if (usesTransportCompany && !selectedCompany?.id) {
      setError(t('procurement.sectionPayable.transportCompanyRequired'));
      return;
    }
    if (isCargo) {
      if (!(Number(form.totalWeightKg) > 0) || !(Number(form.cargoRateUsdPerKg) > 0) || !(Number(form.usdExchangeRate) > 0)) {
        setError(t('procurement.sectionPayable.cargoInputsRequired'));
        return;
      }
      const hasCargoReceipt =
        Boolean(pendingCargoReceipt) || Boolean(primaryExpense?.cargoReceipts?.length);
      if (!hasCargoReceipt) {
        setError(t('procurement.sectionPayable.cargoReceiptRequired'));
        return;
      }
    } else if (!(Number(form.amount) > 0)) {
      setError(t('procurement.sectionPayable.amountRequired'));
      return;
    }
    if (form.paymentMethod === 'BANK_ACCOUNT' && !form.accountNumber.trim()) {
      setError(t('procurement.paymentInfo.accountNumberRequired'));
      return;
    }
    const companyQrCount = selectedCompany?.qrAttachments?.length ?? 0;
    if (
      form.paymentMethod === 'QR_CODE' &&
      pendingQrFiles.length === 0 &&
      companyQrCount === 0 &&
      !(primaryExpense?.qrCodes?.length)
    ) {
      setError(t('procurement.sectionPayable.qrRequired'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        procurementOrderId: orderId,
        expenseType,
        requestType,
        transportCompanyId: selectedCompany?.id,
        supplierCarrier:
          selectedCompany?.name || form.expenseName || t('procurement.sectionPayable.defaultCarrier'),
        expenseName: form.expenseName || undefined,
        recipientName: selectedCompany?.name || form.expenseName || undefined,
        currency: isCargo ? 'KGS' : form.currency,
        paymentMethod: form.paymentMethod,
        bankName: form.paymentMethod === 'BANK_ACCOUNT' ? form.bankName || undefined : undefined,
        accountHolder:
          form.paymentMethod === 'BANK_ACCOUNT' ? form.accountHolder || undefined : undefined,
        accountNumber:
          form.paymentMethod === 'BANK_ACCOUNT' ? form.accountNumber || undefined : undefined,
      };

      if (isCargo) {
        payload.totalWeightKg = Number(form.totalWeightKg);
        payload.cargoRateUsdPerKg = Number(form.cargoRateUsdPerKg);
        payload.usdExchangeRate = Number(form.usdExchangeRate);
        payload.calculatedAmountUsd = Number(cargoTotals.calculatedAmountUsd);
        payload.calculatedAmountKgs = Number(cargoTotals.calculatedAmountKgs);
        payload.amount = Number(cargoTotals.calculatedAmountKgs);
        payload.currency = 'KGS';
      } else {
        payload.amount = Number(form.amount);
      }

      let expenseId = primaryExpense?.id ?? null;
      const editingExisting =
        Boolean(primaryExpense) && EDITABLE_STATUSES.has(primaryExpense!.status);

      if (editingExisting && expenseId) {
        await apiFetch(`/procurement/transport-expenses/${expenseId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiFetch<SectionExpense>('/procurement/transport-expenses', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            sendToAccountant: form.paymentMethod === 'BANK_ACCOUNT' && !pendingInvoice && !isCargo,
          }),
        });
        expenseId = created.id;
        if (created.status === 'WAITING_ACCOUNTANT' || created.status === 'UNDER_REVIEW') {
          setPendingQrFiles([]);
          setPendingInvoice(null);
          setPendingCargoReceipt(null);
          load();
          return;
        }
      }

      if (!expenseId) throw new Error(t('common.error'));

      for (const file of pendingQrFiles) {
        await uploadQrToExpense(expenseId, file);
      }
      if (
        pendingQrFiles.length === 0 &&
        form.paymentMethod === 'QR_CODE' &&
        selectedCompany?.id &&
        companyQrCount > 0 &&
        !(primaryExpense?.qrCodes?.length)
      ) {
        await cloneCompanyQr(expenseId, selectedCompany.id);
      }
      if (pendingInvoice) {
        await uploadInvoiceToExpense(expenseId, pendingInvoice);
      }
      if (pendingCargoReceipt) {
        await uploadCargoReceiptToExpense(expenseId, pendingCargoReceipt);
      }

      await apiFetch(`/procurement/transport-expenses/${expenseId}/submit`, {
        method: 'POST',
        body: '{}',
      });

      setPendingQrFiles([]);
      setPendingInvoice(null);
      setPendingCargoReceipt(null);
      setTouchedPaymentFields({ bankName: false, accountHolder: false, accountNumber: false });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function onPickQr(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setPendingQrFiles((current) => [...current, ...files]);
  }

  async function approve() {
    if (!approveTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/transport-expenses/${approveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          exchangeRate: approveForm.exchangeRate ? Number(approveForm.exchangeRate) : undefined,
          financeAccountId: approveForm.financeAccountId || undefined,
          accountantComment: approveForm.accountantComment || undefined,
          sendToCashier: true,
        }),
      });
      setApproveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmPay() {
    if (!confirmTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/transport-expenses/${confirmTarget.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          financeAccountId: confirmForm.financeAccountId,
          transactionNumber: confirmForm.transactionNumber || undefined,
          cashierComment: confirmForm.cashierComment || undefined,
          paidAmountKgs: confirmForm.paidAmountKgs ? Number(confirmForm.paidAmountKgs) : undefined,
        }),
      });
      setConfirmTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadReceipt(expenseId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const body = new FormData();
    body.append('file', file);
    setSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/procurement/transport-expenses/${expenseId}/attachments/receipt`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn() {
    if (!returnTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/procurement/transport-expenses/${returnTarget.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      setReturnTarget(null);
      setReturnReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        value: company.id,
        label: company.companyCode ? `${company.name} (${company.companyCode})` : company.name,
      })),
    [companies],
  );

  // After SM sends the invoice, hide the entire payment-request UI (form, disabled
  // button, status/QR summary). Records remain; accountant/cashier workflows unchanged.
  // RETURNED keeps the existing correction form via isFormEditable.
  if (isCreatorOnlyView && isFormLocked) {
    return null;
  }

  const panel = (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-semibold text-slate-900">{t('procurement.sectionPayable.title')}</h4>
      {error ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {isReturned && primaryExpense?.returnReason ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('procurement.sectionPayable.returnedForCorrection')}: {primaryExpense.returnReason}
        </p>
      ) : null}

      {isFormEditable ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {showExpenseName ? (
            <CompactField
              label={t('procurement.sectionPayable.expenseName')}
              value={form.expenseName}
              onChange={(value) => setForm({ ...form, expenseName: value })}
            />
          ) : null}

          {usesTransportCompany ? (
            <div className="md:col-span-2 lg:col-span-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <EntityCombobox
                    label={t('procurement.sectionPayable.transportCompany')}
                    value={selectedCompany?.id ?? ''}
                    options={companyOptions}
                    onChange={(id) => {
                      if (!id) {
                        setSelectedCompany(null);
                        return;
                      }
                      const company = companies.find((row) => row.id === id);
                      if (company) applyCompanyToForm(company);
                    }}
                    placeholder={t('procurement.sectionPayable.searchTransportCompany')}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateCompany(true)}
                  className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700"
                >
                  {t('procurement.sectionPayable.createTransportCompany')}
                </button>
              </div>
            </div>
          ) : (
            <CompactField
              label={t('procurement.sectionPayable.recipient')}
              value={form.expenseName}
              onChange={(value) => setForm({ ...form, expenseName: value })}
            />
          )}

          {isCargo ? (
            <>
              <CompactField
                label={t('procurement.sectionPayable.cargoWeightKg')}
                type="number"
                value={form.totalWeightKg}
                onChange={(value) => setForm({ ...form, totalWeightKg: value })}
              />
              <CompactField
                label={t('procurement.sectionPayable.cargoRateUsdPerKg')}
                type="number"
                value={form.cargoRateUsdPerKg}
                onChange={(value) => setForm({ ...form, cargoRateUsdPerKg: value })}
              />
              <CompactField
                label={t('procurement.sectionPayable.usdExchangeRate')}
                type="number"
                value={form.usdExchangeRate}
                onChange={(value) => setForm({ ...form, usdExchangeRate: value })}
              />
              <CompactField
                label={t('procurement.sectionPayable.calculatedUsd')}
                type="number"
                value={cargoTotals.calculatedAmountUsd}
                onChange={() => undefined}
                readOnly
              />
              <CompactField
                label={t('procurement.sectionPayable.calculatedKgs')}
                type="number"
                value={cargoTotals.calculatedAmountKgs}
                onChange={() => undefined}
                readOnly
              />
            </>
          ) : (
            <>
              <CompactField
                label={t('procurement.sectionPayable.amount')}
                type="number"
                value={form.amount}
                onChange={(value) => setForm({ ...form, amount: value })}
              />
              <CompactField
                label={t('procurement.sectionPayable.currency')}
                value={form.currency}
                onChange={(value) => setForm({ ...form, currency: value })}
              />
            </>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.paymentMethod')}</span>
            <select
              value={form.paymentMethod}
              onChange={(e) =>
                setForm({ ...form, paymentMethod: e.target.value as 'BANK_ACCOUNT' | 'QR_CODE' })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="QR_CODE">{t('procurement.paymentInfo.method.QR_CODE')}</option>
              <option value="BANK_ACCOUNT">{t('procurement.paymentInfo.method.BANK_ACCOUNT')}</option>
            </select>
          </label>

          {form.paymentMethod === 'BANK_ACCOUNT' ? (
            <>
              <CompactField
                label={t('procurement.paymentInfo.accountNumber')}
                value={form.accountNumber}
                onChange={(value) => {
                  setTouchedPaymentFields((current) => ({ ...current, accountNumber: true }));
                  setForm({ ...form, accountNumber: value });
                }}
              />
              <CompactField
                label={`${t('procurement.paymentInfo.bankName')} (${t('common.optional')})`}
                value={form.bankName}
                onChange={(value) => {
                  setTouchedPaymentFields((current) => ({ ...current, bankName: true }));
                  setForm({ ...form, bankName: value });
                }}
              />
              <CompactField
                label={`${t('procurement.paymentInfo.accountHolder')} (${t('common.optional')})`}
                value={form.accountHolder}
                onChange={(value) => {
                  setTouchedPaymentFields((current) => ({ ...current, accountHolder: true }));
                  setForm({ ...form, accountHolder: value });
                }}
              />
            </>
          ) : (
            <div className="md:col-span-2 lg:col-span-3 space-y-2">
              <label className="inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold">
                {t('procurement.paymentInfo.uploadQr')}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={onPickQr} />
              </label>
              {primaryExpense?.qrCodes?.length ? (
                <ul className="space-y-1 text-xs text-slate-600">
                  {primaryExpense.qrCodes.map((qr) => (
                    <li key={qr.id}>{qr.fileName}</li>
                  ))}
                </ul>
              ) : null}
              {pendingQrFiles.length ? (
                <ul className="space-y-1 text-xs text-slate-600">
                  {pendingQrFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        className="font-semibold text-red-700"
                        onClick={() =>
                          setPendingQrFiles((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        {t('common.delete')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : selectedCompany?.qrAttachments?.length && !primaryExpense?.qrCodes?.length ? (
                <p className="text-xs text-slate-600">
                  {t('procurement.sectionPayable.companyQrAvailable')}:{' '}
                  {selectedCompany.qrAttachments.map((qr) => qr.fileName).join(', ')}
                </p>
              ) : null}
            </div>
          )}

          {isCargo ? (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">
                  {t('procurement.sectionPayable.cargoReceipt')} *
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setPendingCargoReceipt(e.target.files?.[0] ?? null)}
                />
              </label>
              {primaryExpense?.cargoReceipts?.length ? (
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                  {primaryExpense.cargoReceipts.map((file) => (
                    <a
                      key={file.id}
                      href={`${API_URL}${file.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700"
                    >
                      {file.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
              {pendingCargoReceipt ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <span>{pendingCargoReceipt.name}</span>
                  <button
                    type="button"
                    className="font-semibold text-red-700"
                    onClick={() => setPendingCargoReceipt(null)}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                {t('procurement.sectionPayable.attachInvoice')} ({t('common.optional')})
              </span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="mt-1 block w-full text-sm"
                onChange={(e) => setPendingInvoice(e.target.files?.[0] ?? null)}
              />
            </label>
          )}

          <div className="md:col-span-2 lg:col-span-3">
            <button
              type="button"
              disabled={saving || !formValid}
              onClick={() => void sendToAccountant()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {t('procurement.payments.sendInvoice')}
            </button>
          </div>
        </div>
      ) : null}

      {showExpenseList ? (
      <div className="mt-4 space-y-2">
        {sectionRows.length === 0 ? (
          <p className="text-xs text-slate-500">{t('procurement.sectionPayable.empty')}</p>
        ) : (
          sectionRows.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {row.expenseNumber} · {Number(row.amount).toFixed(2)} {row.currency}
                    {row.transportCompany?.name
                      ? ` · ${row.transportCompany.name}`
                      : row.recipientName
                        ? ` · ${row.recipientName}`
                        : ''}
                  </p>
                  <p className="text-xs text-slate-600">
                    {translateStatus(t, row.status)} ·{' '}
                    {t(`procurement.paymentInfo.method.${row.paymentMethod}`)}
                    {row.paidAmountKgs != null && Number(row.paidAmountKgs) > 0
                      ? ` · ${t('procurement.sectionPayable.paid')}: ${Number(row.paidAmountKgs).toFixed(2)} KGS`
                      : ''}
                  </p>
                  {row.returnReason ? (
                    <p className="mt-1 text-xs text-amber-800">
                      {t('procurement.sectionPayable.correctionReason')}: {row.returnReason}
                    </p>
                  ) : null}
                  {row.calculatedAmountKgs != null ? (
                    <p className="text-xs text-slate-500">
                      {Number(row.totalWeightKg || 0).toFixed(3)} kg ×{' '}
                      {Number(row.cargoRateUsdPerKg || 0).toFixed(4)} USD
                      {' → '}
                      {Number(row.calculatedAmountUsd || 0).toFixed(2)} USD /{' '}
                      {Number(row.calculatedAmountKgs).toFixed(2)} KGS
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApprove &&
                  (row.status === 'WAITING_ACCOUNTANT' || row.status === 'UNDER_REVIEW') ? (
                    <button
                      type="button"
                      className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700"
                      onClick={() => {
                        setApproveTarget(row);
                        setApproveForm({
                          exchangeRate: '',
                          financeAccountId: '',
                          accountantComment: '',
                        });
                      }}
                    >
                      {t('procurement.sectionPayable.approve')}
                    </button>
                  ) : null}
                  {(canApprove || canConfirm) &&
                  (row.status === 'WAITING_ACCOUNTANT' ||
                    row.status === 'PENDING_CASHIER' ||
                    row.status === 'PARTIALLY_PAID') ? (
                    <button
                      type="button"
                      className="rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800"
                      onClick={() => {
                        setReturnTarget(row);
                        setReturnReason('');
                      }}
                    >
                      {t('procurement.payments.returnToAccountant')}
                    </button>
                  ) : null}
                  {canConfirm &&
                  (row.status === 'PENDING_CASHIER' || row.status === 'PARTIALLY_PAID') ? (
                    <>
                      <label className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold">
                        {t('procurement.payments.uploadReceipt')}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => void uploadReceipt(row.id, e)}
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => {
                          const remaining = Math.max(
                            Number(row.amountKgs || row.amount) - Number(row.paidAmountKgs || 0),
                            0,
                          );
                          setConfirmTarget(row);
                          setConfirmForm({
                            financeAccountId: '',
                            transactionNumber: '',
                            cashierComment: '',
                            paidAmountKgs: remaining > 0 ? remaining.toFixed(2) : '',
                          });
                        }}
                      >
                        {t('procurement.sectionPayable.confirm')}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {row.cargoReceipts?.length ? (
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className="font-semibold text-slate-600">
                    {t('procurement.sectionPayable.cargoReceipt')}:
                  </span>
                  {row.cargoReceipts.map((file) => (
                    <a
                      key={file.id}
                      href={`${API_URL}${file.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700"
                    >
                      {file.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
              {row.qrCodes?.length ? (
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {row.qrCodes.map((qr) => (
                    <span key={qr.id} className="text-slate-600">
                      {qr.fileName}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      ) : null}

      {showSubmissionSummary && primaryExpense ? (
        <div className="mt-4 rounded-lg border border-slate-300 bg-white p-3 text-sm">
          <h5 className="font-semibold text-slate-900">
            {t('procurement.sectionPayable.submissionSummary')}
          </h5>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <SummaryField
              label={t('procurement.sectionPayable.status')}
              value={t(
                `procurement.sectionPayable.invoiceStatus.${mapUiInvoiceStatus(primaryExpense.status)}`,
              )}
            />
            <SummaryField
              label={t('procurement.sectionPayable.sentAt')}
              value={
                primaryExpense.submittedAt
                  ? new Date(primaryExpense.submittedAt).toLocaleString()
                  : '—'
              }
            />
            <SummaryField
              label={t('procurement.sectionPayable.sentBy')}
              value={primaryExpense.createdBy?.fullName || '—'}
            />
            <SummaryField
              label={t('procurement.sectionPayable.amount')}
              value={`${Number(primaryExpense.amount).toFixed(2)} ${primaryExpense.currency}`}
            />
            <SummaryField
              label={t('procurement.sectionPayable.recipient')}
              value={
                primaryExpense.transportCompany?.name ||
                primaryExpense.recipientName ||
                primaryExpense.supplierCarrier ||
                '—'
              }
            />
            <SummaryField
              label={t('procurement.sectionPayable.expenseName')}
              value={primaryExpense.expenseName || primaryExpense.comment || '—'}
            />
            <SummaryField
              label={t('procurement.sectionPayable.accountantStatus')}
              value={translateStatus(t, primaryExpense.status)}
            />
            <SummaryField
              label={t('procurement.sectionPayable.lastUpdated')}
              value={
                primaryExpense.updatedAt
                  ? new Date(primaryExpense.updatedAt).toLocaleString()
                  : '—'
              }
            />
            {primaryExpense.returnReason ? (
              <div className="sm:col-span-2">
                <SummaryField
                  label={t('procurement.sectionPayable.correctionReason')}
                  value={primaryExpense.returnReason}
                />
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {showCreateCompany ? (
        <TransportCompanyQuickCreateModal
          t={t}
          onClose={() => setShowCreateCompany(false)}
          onCreated={async (company) => {
            setShowCreateCompany(false);
            const list = await loadCompanies();
            const fresh = list.find((item) => item.id === company.id) || company;
            setCompanies((current) =>
              current.some((item) => item.id === fresh.id) ? current : [fresh, ...current],
            );
            applyCompanyToForm(fresh, false);
          }}
        />
      ) : null}

      {approveTarget ? (
        <Modal title={t('procurement.sectionPayable.approve')} onClose={() => setApproveTarget(null)}>
          <CompactField label={t('procurement.payments.exchangeRate')} type="number" value={approveForm.exchangeRate} onChange={(v) => setApproveForm({ ...approveForm, exchangeRate: v })} />
          <label className="mt-2 block">
            <span className="text-xs font-semibold">{t('procurement.payments.financeAccount')}</span>
            <select
              value={approveForm.financeAccountId}
              onChange={(e) => setApproveForm({ ...approveForm, financeAccountId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={saving} onClick={() => void approve()} className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            {t('procurement.sectionPayable.approve')}
          </button>
        </Modal>
      ) : null}

      {confirmTarget ? (
        <Modal title={t('procurement.sectionPayable.confirm')} onClose={() => setConfirmTarget(null)}>
          <CompactField
            label={t('procurement.sectionPayable.partialPayAmount')}
            type="number"
            value={confirmForm.paidAmountKgs}
            onChange={(v) => setConfirmForm({ ...confirmForm, paidAmountKgs: v })}
          />
          <label className="mt-2 block">
            <span className="text-xs font-semibold">{t('procurement.payments.financeAccount')}</span>
            <select
              value={confirmForm.financeAccountId}
              onChange={(e) => setConfirmForm({ ...confirmForm, financeAccountId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={saving} onClick={() => void confirmPay()} className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
            {t('procurement.sectionPayable.confirm')}
          </button>
        </Modal>
      ) : null}

      {returnTarget ? (
        <Modal title={t('procurement.payments.returnToAccountant')} onClose={() => setReturnTarget(null)}>
          <CompactField label={t('procurement.payments.returnReason')} value={returnReason} onChange={setReturnReason} />
          <button type="button" disabled={saving} onClick={() => void submitReturn()} className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white">
            {t('common.save')}
          </button>
        </Modal>
      ) : null}
    </div>
  );

  if (headingKey) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold">{t(headingKey)}</h3>
        {panel}
      </section>
    );
  }

  return panel;
}

function TransportCompanyQuickCreateModal({
  t,
  onClose,
  onCreated,
}: {
  t: (key: string) => string;
  onClose: () => void;
  onCreated: (company: TransportCompany) => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    country: '',
    city: '',
    bankAccount: '',
  });

  async function create() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const company = await apiFetch<TransportCompany>('/procurement/transport-companies', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          contactPerson: form.contactPerson.trim() || undefined,
          phone: form.phone.trim() || undefined,
          country: form.country.trim() || undefined,
          city: form.city.trim() || undefined,
          bankAccount: form.bankAccount.trim() || undefined,
          status: 'ACTIVE',
        }),
      });
      if (qrFile) {
        const token = getToken();
        if (token) {
          const body = new FormData();
          body.append('file', qrFile);
          await fetch(`${API_URL}/procurement/transport-companies/${company.id}/attachments/qr`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body,
          });
        }
      }
      await onCreated(company);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('procurement.sectionPayable.createTransportCompany')} onClose={onClose}>
      {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="space-y-2">
        <CompactField
          label={t('procurement.transportCompanies.name')}
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
        />
        <CompactField
          label={`${t('procurement.transportCompanies.contactPerson')} (${t('common.optional')})`}
          value={form.contactPerson}
          onChange={(value) => setForm({ ...form, contactPerson: value })}
        />
        <CompactField
          label={`${t('procurement.transportCompanies.phone')} (${t('common.optional')})`}
          value={form.phone}
          onChange={(value) => setForm({ ...form, phone: value })}
        />
        <CompactField
          label={`${t('procurement.transportCompanies.country')} (${t('common.optional')})`}
          value={form.country}
          onChange={(value) => setForm({ ...form, country: value })}
        />
        <CompactField
          label={`${t('procurement.transportCompanies.city')} (${t('common.optional')})`}
          value={form.city}
          onChange={(value) => setForm({ ...form, city: value })}
        />
        <CompactField
          label={`${t('procurement.sectionPayable.bankAccount')} (${t('common.optional')})`}
          value={form.bankAccount}
          onChange={(value) => setForm({ ...form, bankAccount: value })}
        />
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">
            QR Code ({t('common.optional')})
          </span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={saving || !form.name.trim()}
            onClick={() => void create()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-blue-300"
          >
            {t('procurement.sectionPayable.createTransportCompany')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CompactField({
  label,
  value,
  onChange,
  type = 'text',
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        step={type === 'number' ? 'any' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm ${readOnly ? 'bg-slate-100 text-slate-700' : ''}`}
      />
    </label>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
