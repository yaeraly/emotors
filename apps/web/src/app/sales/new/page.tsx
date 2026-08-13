'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { SaleLinePricingTooltip } from '@/components/SaleLinePricingTooltip';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SaleCustomerSearch, type SaleCustomerOption } from '@/components/SaleCustomerSearch';
import { SaleProductSearch, type SaleProductOption } from '@/components/SaleProductSearch';
import { apiFetch } from '@/lib/api';
import { canCreateCustomer, canSubmitSaleInstallmentRequest, isBranchSalesManagerUser, shouldSyncSalePaymentsOnDraftSave } from '@/lib/rbac';
import { evaluateSaleLinePrice } from '@/lib/sale-pricing';
import {
  applyLoyaltyMarkupToRecommendedPrice,
  customerTypeLabelKey,
  loyaltyCategoryLabelKey,
  preserveSaleLineQuantity,
  resolvePricingChannelFromCustomerType,
} from '@/lib/sale-customer-pricing';
import { formatKgsLocalized } from '@/lib/money';
import {
  computeRemainingDebt,
  draftLooksLikeInstallment,
  installmentBlocksCompletion,
  installmentStatusLabelKey,
  saleIsInstallment,
} from '@/lib/sale-installment';
import { SALE_PAYMENT_METHODS, formatPaymentMethodLabel } from '@/lib/sale-payment-methods';
import {
  availableMethodsForRow,
  buildPaymentPayloads,
  computePaymentAllocation,
  createPaymentPartRow,
  isPaymentComplete,
  validatePaymentParts,
  type PaymentPartRow,
} from '@/lib/sale-payment-parts';
import {
  buildFullPaymentRows,
  canFinalizeFullPaymentSale,
  computeFullPaymentChange,
  formatFullPaymentAmount,
  resolveFullPaymentReceivedAmount,
  syncFullPaymentRowsOnTotalChange,
  validateFullPaymentReceivedAmount,
  FULL_PAYMENT_UNDERPAYMENT_MESSAGE_KEY,
  shouldUseBranchCashierFullPaymentFlow,
} from '@/lib/sale-full-payment';
import type { Customer, PaymentMethod, Sale, User, WhatsAppDraftResponse } from '@/lib/types';
import {
  canEditDraftSale,
  customerOptionFromSale,
  mapSaleItemToFormSeed,
  pricingChannelForSaleCustomer,
  resolveInstallmentFieldsFromSale,
  resolvePaymentTypeFromSale,
} from '@/lib/sale-draft-edit';
import { useTranslation } from '@/i18n/useTranslation';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import { getStatusLabel } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

type SaleItemForm = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  quantity: string;
  listPrice: number;
  minimumPrice: number;
  recommendedPrice: number;
  maximumPrice: number | null;
  hasMaximumPrice: boolean;
  discountPercent: string;
  unitPrice: string;
  unitPriceManuallyEdited?: boolean;
  unitCost: string;
  availableQty: number;
  maxDiscountPercent: number;
  hasPricingPolicy: boolean;
};

type PaymentType = 'FULL_PAYMENT' | 'INSTALLMENT';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function priceFromDiscount(listPrice: number, discountPercent: number) {
  return roundMoney(listPrice * (1 - discountPercent / 100));
}

function formatPriceInput(value: number) {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}


export default function NewSalePage() {
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">...</p>
        </ProtectedShell>
      }
    >
      <NewSalePageContent />
    </Suspense>
  );
}

function NewSalePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editSaleId = searchParams.get('edit');
  const { t } = useTranslation();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomerOption | null>(null);
  const [includeArchivedCustomers, setIncludeArchivedCustomers] = useState(false);
  const [items, setItems] = useState<SaleItemForm[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>('FULL_PAYMENT');
  const [paymentRows, setPaymentRows] = useState<PaymentPartRow[]>([
    createPaymentPartRow({ method: 'CASH' }),
  ]);
  const [isReceivedAmountManuallyEdited, setIsReceivedAmountManuallyEdited] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [createCustomerForm, setCreateCustomerForm] = useState({
    fullName: '',
    phone: '',
    whatsappPhone: '',
    customerType: 'RETAIL' as 'RETAIL' | 'MASTER' | 'WHOLESALE',
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [draftSale, setDraftSale] = useState<Sale | null>(null);
  const [paymentsSynced, setPaymentsSynced] = useState(false);
  const [downPayment, setDownPayment] = useState('');
  const [finalPaymentDate, setFinalPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [submittingInstallment, setSubmittingInstallment] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pricingPolicyWarning, setPricingPolicyWarning] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(Boolean(editSaleId));

  const branchSalesManagerView = isBranchSalesManagerUser(user);
  const branchCashierHandoffFlow = shouldUseBranchCashierFullPaymentFlow(user);
  const showPageTitle = !usesUnifiedNavPageTitle(user);
  const canEditSalePrice = Boolean(user);
  const canSubmitInstallment = canSubmitSaleInstallmentRequest(user);
  const canCreateCustomerAction = canCreateCustomer(user);

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!editSaleId || !user) return;
    void loadExistingDraft(editSaleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSaleId, user?.id]);

  async function loadExistingDraft(saleId: string) {
    setLoadingDraft(true);
    setError('');

    try {
      const sale = await apiFetch<Sale>(`/sales/${saleId}`);
      if (!canEditDraftSale(user, sale)) {
        setError(t('sales.draftEditBlocked'));
        return;
      }

      const customer = customerOptionFromSale(sale);
      setSelectedCustomer(customer);
      setDraftSale(sale);
      setNotes(sale.notes ?? '');

      const resolvedPaymentType = resolvePaymentTypeFromSale(sale);
      setPaymentType(resolvedPaymentType);
      if (resolvedPaymentType === 'INSTALLMENT') {
        const installmentFields = resolveInstallmentFieldsFromSale(sale);
        setDownPayment(installmentFields.downPayment);
        setFinalPaymentDate(installmentFields.finalPaymentDate);
      } else {
        setDownPayment('');
        setFinalPaymentDate('');
      }

      const channel = pricingChannelForSaleCustomer(customer);
      const hydratedItems = await Promise.all(
        (sale.items ?? []).map(async (item) => {
          if (!item.productSku) {
            return mapSaleItemToFormSeed(item, null, customer) satisfies SaleItemForm;
          }
          const params = new URLSearchParams({
            search: item.productSku,
            pricingChannel: channel,
          });
          try {
            const products = await apiFetch<SaleProductOption[]>(
              `/sales/product-options?${params.toString()}`,
            );
            const product = products.find((row) => row.id === item.productId);
            return mapSaleItemToFormSeed(item, product ?? null, customer) satisfies SaleItemForm;
          } catch {
            return mapSaleItemToFormSeed(item, null, customer) satisfies SaleItemForm;
          }
        }),
      );
      setItems(hydratedItems);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoadingDraft(false);
    }
  }

  const totals = useMemo(() => {
    const totalAmount = roundMoney(
      items.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    );
    const totalCost = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
      0,
    );
    const profit = totalAmount - totalCost;
    const allocation = computePaymentAllocation(paymentRows, totalAmount);

    return {
      totalAmount,
      totalCost,
      profit,
      paidTotal: allocation.appliedTotal,
      remainingAmount: allocation.remainingAmount,
      totalCashChange: allocation.changeAmount,
      cashShortage: allocation.cashShortage,
    };
  }, [items, paymentRows]);

  const fullPaymentReceivedAmount = useMemo(
    () => resolveFullPaymentReceivedAmount(paymentRows),
    [paymentRows],
  );
  const fullPaymentChange = useMemo(
    () => computeFullPaymentChange(totals.totalAmount, fullPaymentReceivedAmount),
    [totals.totalAmount, fullPaymentReceivedAmount],
  );

  useEffect(() => {
    if (paymentType !== 'FULL_PAYMENT') return;
    setPaymentRows((current) =>
      syncFullPaymentRowsOnTotalChange(current, totals.totalAmount, isReceivedAmountManuallyEdited),
    );
    setPaymentsSynced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentType, totals.totalAmount, isReceivedAmountManuallyEdited]);

  useEffect(() => {
    if (paymentType !== 'INSTALLMENT') return;
    const down = Number(downPayment || 0);
    setPaymentRows((current) => [
      {
        ...(current[0] ?? createPaymentPartRow()),
        amount: down > 0 ? String(down) : '',
      },
    ]);
    setPaymentsSynced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentType, downPayment]);

  const installmentRemainingDebt = useMemo(
    () => computeRemainingDebt(totals.totalAmount, Number(downPayment || 0)),
    [totals.totalAmount, downPayment],
  );

  const isInstallmentDraft = useMemo(
    () => draftLooksLikeInstallment(paymentType, finalPaymentDate, totals.totalAmount),
    [paymentType, finalPaymentDate, totals.totalAmount],
  );

  const linePriceStates = useMemo(
    () =>
      items.map((item) =>
        evaluateSaleLinePrice({
          unitPrice: item.unitPrice,
          rawUnitPrice: item.unitPrice,
          minimumPrice: item.minimumPrice,
          recommendedPrice: item.recommendedPrice,
          maximumPrice: item.maximumPrice,
          hasMaximumPrice: item.hasMaximumPrice,
        }),
      ),
    [items],
  );

  const hasBlockingPriceError = linePriceStates.some((state) => state.level === 'error');
  const hasMissingPricing = items.some((item) => !item.hasPricingPolicy);
  const paymentValidation = useMemo(
    () =>
      paymentType === 'FULL_PAYMENT'
        ? validatePaymentParts(paymentRows, totals.totalAmount)
        : { ok: true as const },
    [paymentType, paymentRows, totals.totalAmount],
  );
  const paymentComplete =
    paymentType !== 'FULL_PAYMENT' ||
    isPaymentComplete(paymentRows, totals.totalAmount);

  function formatPaymentError(
    validation: ReturnType<typeof validatePaymentParts>,
  ) {
    if (validation.ok) return '';
    if (validation.messageKey === 'sales.insufficientCash' && validation.amount != null) {
      return t('sales.insufficientCash').replace(
        '{amount}',
        validation.amount.toLocaleString('ru-RU'),
      );
    }
    return t(validation.messageKey);
  }

  const isInstallmentSale =
    paymentType === 'INSTALLMENT' && (saleIsInstallment(draftSale) || isInstallmentDraft);
  const installmentApproval = draftSale?.installmentApproval;
  const installmentStatusKey = installmentStatusLabelKey(installmentApproval?.status);
  const installmentPending =
    installmentApproval?.status === 'PENDING_BRANCH_CEO_APPROVAL';
  const installmentApproved = installmentApproval?.status === 'APPROVED';
  const installmentRejected = installmentApproval?.status === 'REJECTED';
  const installmentCancelled = installmentApproval?.status === 'CANCELLED';
  const canFinalize =
    Boolean(selectedCustomer) &&
    items.length > 0 &&
    !hasBlockingPriceError &&
    !hasMissingPricing &&
    (!draftSale ||
      (draftSale.status !== 'FINALIZED' &&
        draftSale.status !== 'CANCELLED' &&
        draftSale.status !== 'WAITING_FOR_CASHIER_PAYMENT')) &&
    (paymentType === 'FULL_PAYMENT'
      ? canFinalizeFullPaymentSale({
          user,
          paymentType,
          totalAmount: totals.totalAmount,
          receivedAmount: fullPaymentReceivedAmount,
          hasBlockingPriceError,
          hasMissingPricing,
          paymentValidationOk: paymentValidation.ok,
          paymentComplete,
        })
      : Boolean(draftSale) &&
        (installmentApproved || installmentApproval?.status === 'ACTIVE'));

  const appliedPricingChannel = useMemo(
    () => resolvePricingChannelFromCustomerType(selectedCustomer?.customerType),
    [selectedCustomer?.customerType],
  );

  function buildSaleItemFromProduct(
    product: SaleProductOption,
    quantity = '1',
    customer: SaleCustomerOption | null = selectedCustomer,
  ): SaleItemForm {
    const baseRecommended = product.recommendedRetailPriceKgs ?? product.sellingPriceKgs;
    const minimumPrice =
      product.minimumRetailPriceKgs ?? product.minimumSellingPriceKgs ?? baseRecommended;
    const maximumPrice = product.maximumRetailPriceKgs ?? null;
    const loyaltyMarkupPercent = Number(
      customer?.currentMarkupPercent ??
        customer?.currentAdditionalMarkup ??
        customer?.currentDiscountPercent ??
        0,
    );
    const recommendedPrice = applyLoyaltyMarkupToRecommendedPrice({
      basePriceKgs: baseRecommended,
      loyaltyMarkupPercent,
      minimumPriceKgs: minimumPrice,
      maximumPriceKgs: maximumPrice,
    });
    const hasPricingPolicy =
      product.hasRecommendedPrice !== false &&
      baseRecommended > 0 &&
      recommendedPrice > 0 &&
      minimumPrice > 0;

    return {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      unit: product.unit,
      quantity,
      listPrice: recommendedPrice,
      minimumPrice,
      recommendedPrice,
      maximumPrice,
      hasMaximumPrice: Boolean(product.hasMaximumRetailPrice && maximumPrice && maximumPrice > 0),
      discountPercent: '0',
      unitPrice: formatPriceInput(recommendedPrice),
      unitPriceManuallyEdited: false,
      unitCost: '0',
      availableQty: product.availableQty,
      maxDiscountPercent: product.maximumDiscountPercent,
      hasPricingPolicy,
    };
  }

  async function recalculateDraftPricesForCustomer(customer: SaleCustomerOption) {
    if (items.length === 0) return;

    const hadManualPrices = items.some((item) => item.unitPriceManuallyEdited);
    const channel = resolvePricingChannelFromCustomerType(customer.customerType);
    const refreshedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const params = new URLSearchParams({
            search: item.productSku,
            pricingChannel: channel,
          });
          const products = await apiFetch<SaleProductOption[]>(
            `/sales/product-options?${params.toString()}`,
          );
          const product = products.find((row) => row.id === item.productId);
          if (!product) {
            return { ...item, hasPricingPolicy: false };
          }
          return preserveSaleLineQuantity(
            item,
            buildSaleItemFromProduct(product, item.quantity, customer),
          );
        } catch {
          return { ...item, hasPricingPolicy: false };
        }
      }),
    );

    setItems(refreshedItems);
    if (refreshedItems.some((item) => !item.hasPricingPolicy)) {
      setError(t('sales.priceNotConfigured'));
    } else if (hadManualPrices) {
      toast.success(t('sales.manualPriceResetOnCustomerChange'));
    }
  }

  async function handleCustomerSelect(customer: SaleCustomerOption) {
    setError('');
    try {
      const refreshed = await apiFetch<Customer>(`/customers/${customer.id}`);
      const nextCustomer: SaleCustomerOption = {
        ...customer,
        customerType:
          refreshed.customerType === 'WHOLESALE'
            ? 'WHOLESALE'
            : refreshed.customerType === 'MASTER'
              ? 'MASTER'
              : 'RETAIL',
        loyaltyCategory: refreshed.loyaltyCategory ?? refreshed.customerCategory,
        customerCategory: refreshed.customerCategory ?? refreshed.loyaltyCategory,
        currentMarkupPercent: refreshed.currentMarkupPercent,
        currentAdditionalMarkup: refreshed.currentAdditionalMarkup,
        currentDiscountPercent: refreshed.currentDiscountPercent,
        totalDebtAmount: Number(refreshed.totalDebtAmount ?? customer.totalDebtAmount),
      };
      setSelectedCustomer(nextCustomer);
      if (items.length > 0) {
        await recalculateDraftPricesForCustomer(nextCustomer);
      }
    } catch {
      setSelectedCustomer(customer);
      if (items.length > 0) {
        await recalculateDraftPricesForCustomer(customer);
      }
    }
  }

  function handleProductSelect(product: SaleProductOption) {
    const recommendedPrice = product.recommendedRetailPriceKgs ?? product.sellingPriceKgs;
    if (branchSalesManagerView && (product.hasRecommendedPrice === false || recommendedPrice <= 0)) {
      setError(t('sales.priceNotConfigured'));
      return;
    }

    const existingIndex = items.findIndex((item) => item.productId === product.id);
    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      const nextQuantity = Number(existing.quantity || 0) + 1;
      if (nextQuantity > product.availableQty) {
        setError(`${t('sales.insufficientStockDetail')} ${product.availableQty}.`);
        return;
      }
      updateItem(existingIndex, { quantity: String(nextQuantity) });
      setError('');
      return;
    }

    setItems((current) => [...current, buildSaleItemFromProduct(product)]);
    setError('');
  }

  function updateItem(index: number, updates: Partial<SaleItemForm>) {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...updates };

        if ('discountPercent' in updates) {
          const discount = Number(next.discountPercent || 0);
          if (discount > next.maxDiscountPercent + 0.01) {
            setError(t('pricing.discountExceeded'));
          } else {
            setError('');
          }
          if (!next.unitPriceManuallyEdited) {
            next.unitPrice = formatPriceInput(priceFromDiscount(next.listPrice, discount));
          }
        }

        if ('unitPrice' in updates) {
          next.unitPrice = updates.unitPrice ?? next.unitPrice;
          next.unitPriceManuallyEdited = true;
        }

        const quantity = Number(next.quantity || 0);
        if (quantity > next.availableQty) {
          setError(`${t('sales.productSearch.insufficientStock')} ${next.availableQty}`);
        }

        return next;
      }),
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setError('');
  }

  function updatePayment(index: number, updates: Partial<PaymentPartRow>) {
    setPaymentsSynced(false);
    setPaymentRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...updates };
        if ('method' in updates) {
          if (updates.method === 'CASH') {
            next.amount = '';
          } else if (updates.method) {
            next.cashReceived = '';
          }
        }
        return next;
      }),
    );
  }

  function addPaymentRow() {
    setPaymentsSynced(false);
    setPaymentRows((current) => {
      const allocation = computePaymentAllocation(current, totals.totalAmount);
      const usedMethods = new Set(
        current
          .map((row) => row.method)
          .filter((method): method is PaymentMethod => Boolean(method)),
      );
      const nextMethod =
        SALE_PAYMENT_METHODS.find((method) => !usedMethods.has(method) && method !== 'CASH') ??
        SALE_PAYMENT_METHODS.find((method) => !usedMethods.has(method));
      if (!nextMethod) return current;
      return [
        ...current,
        createPaymentPartRow({
          method: nextMethod,
          amount: allocation.remainingAmount > 0 ? String(allocation.remainingAmount) : '',
        }),
      ];
    });
  }

  function removePaymentRow(index: number) {
    setPaymentsSynced(false);
    setPaymentRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function buildSalePayload() {
    setError('');

    if (!selectedCustomer) {
      setError(t('sales.selectCustomer'));
      return null;
    }

    const validItems = items.map((item) => ({
      productId: item.productId,
      productName: item.productName.trim(),
      productSku: item.productSku.trim() || undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost || 0),
    }));

    if (
      validItems.length === 0 ||
      validItems.some(
        (item) =>
          !item.productId ||
          !item.productName ||
          item.quantity <= 0 ||
          item.unitPrice < 0,
      )
    ) {
      setError(t('sales.validationItems'));
      return null;
    }

    for (const [index, item] of items.entries()) {
      const quantity = Number(item.quantity || 0);
      if (quantity > item.availableQty) {
        setError(`${t('sales.insufficientStockDetail')} ${item.availableQty}.`);
        return null;
      }
      const discount = Number(item.discountPercent || 0);
      if (discount > item.maxDiscountPercent + 0.01) {
        setError(t('pricing.discountExceeded'));
        return null;
      }
      const unitPrice = Number(item.unitPrice || 0);
      if (!validItems[index]?.productId) {
        setError(t('sales.validationItems'));
        return null;
      }
    }

    if (paymentType === 'FULL_PAYMENT') {
      if (!branchCashierHandoffFlow && (!paymentValidation.ok || !paymentComplete)) {
        setError(formatPaymentError(paymentValidation));
        return null;
      }
    }

    if (paymentType === 'FULL_PAYMENT' && !branchCashierHandoffFlow && !paymentRows[0]?.method) {
      setError(t('sales.paymentMethodRequired'));
      return null;
    }

    if (hasBlockingPriceError) {
      setError(t('sales.priceOutOfRangeBlocked'));
      return null;
    }

    if (hasMissingPricing) {
      setError(t('sales.noPricingPolicy'));
      return null;
    }

    return {
      customerId: selectedCustomer.id,
      items: validItems,
      ...(paymentType === 'INSTALLMENT'
        ? {
            paymentType: 'INSTALLMENT' as const,
            downPayment: Number(downPayment || 0),
            dueDate: new Date(finalPaymentDate).toISOString(),
          }
        : {
            paymentType: 'FULL_PAYMENT' as const,
            receivedAmount: branchCashierHandoffFlow ? totals.totalAmount : fullPaymentReceivedAmount,
          }),
      notes: notes.trim() || undefined,
    };
  }

  async function saveDraft() {
    const payload = buildSalePayload();
    if (!payload) {
      return null;
    }
    setSaving(true);
    /* toast clear */ void 0;

    try {
      let sale = await apiFetch<Sale>(
        draftSale ? `/sales/${draftSale.id}` : '/sales/draft',
        {
          method: draftSale ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );

      if (!paymentsSynced && shouldSyncSalePaymentsOnDraftSave(user, paymentType)) {
        const activePayments = (sale.payments ?? []).filter(
          (payment) => payment.status !== 'VOID',
        );
        for (const payment of activePayments) {
          sale = await apiFetch<Sale>(`/sales/${sale.id}/payments/${payment.id}/void`, {
            method: 'POST',
          });
        }

        const payloads = buildPaymentPayloads(paymentRows, totals.totalAmount);
        for (const payload of payloads) {
          sale = await apiFetch<Sale>(`/sales/${sale.id}/payments`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        setPaymentsSynced(true);
      }

      if (
        draftSale?.pricingPolicyVersionId &&
        sale.pricingPolicyVersionId &&
        draftSale.pricingPolicyVersionId !== sale.pricingPolicyVersionId
      ) {
        setPricingPolicyWarning(t('sales.pricingPolicyChangedOnSaveWarning'));
      } else {
        setPricingPolicyWarning('');
      }
      restoreItemsFromDraft(sale);
      setDraftSale(sale);
      return sale;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sale = await saveDraft();
    if (sale) {
      setError('');
    }
  }

  async function sendWhatsApp() {
    const sale = await saveDraft();
    if (!sale) return;

    try {
      const response = await apiFetch<WhatsAppDraftResponse>(
        `/sales/${sale.id}/send-whatsapp`,
        { method: 'POST' },
      );
      setDraftSale(response.sale);
      window.open(response.whatsappLink, '_blank', 'noopener,noreferrer');
      setError(t('sales.whatsappSent'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submitInstallmentRequest() {
    if (!isInstallmentDraft) {
      setError(t('sales.installmentTermsRequired'));
      return;
    }

    const sale = await saveDraft();
    if (!sale) return;

    setSubmittingInstallment(true);
    setError('');
    /* toast clear */ void 0;

    try {
      await apiFetch(`/sales/${sale.id}/installment-request/submit`, { method: 'POST' });
      const updated = await apiFetch<Sale>(`/sales/${sale.id}`);
      setDraftSale(updated);
      setError('');
      toast.success(t('sales.installmentRequestSubmitted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingInstallment(false);
    }
  }

  async function createCustomer() {
    if (!createCustomerForm.fullName.trim() || !createCustomerForm.phone.trim()) {
      setError(t('sales.createCustomerRequired'));
      return;
    }

    setCreatingCustomer(true);
    setError('');
    try {
      const customer = await apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: createCustomerForm.fullName.trim(),
          phone: createCustomerForm.phone.trim(),
          whatsappPhone: createCustomerForm.whatsappPhone.trim() || undefined,
          status: 'ACTIVE',
          customerType: createCustomerForm.customerType,
        }),
      });
      setSelectedCustomer({
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        whatsappPhone: customer.whatsappPhone,
        status: customer.status,
        customerType:
          customer.customerType === 'WHOLESALE'
            ? 'WHOLESALE'
            : customer.customerType === 'MASTER'
              ? 'MASTER'
              : 'RETAIL',
        totalDebtAmount: Number(customer.totalDebtAmount ?? 0),
        hasOverdueInstallment: false,
      });
      setShowCreateCustomer(false);
      setCreateCustomerForm({
        fullName: '',
        phone: '',
        whatsappPhone: '',
        customerType: 'RETAIL',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCreatingCustomer(false);
    }
  }

  function formatBoundPrice(value: number) {
    return formatKgsLocalized(value);
  }

  function priceWarningMessage(state: ReturnType<typeof evaluateSaleLinePrice>) {
    if (state.level === 'ok') return null;
    if (state.kind === 'empty') return t('sales.priceEmptyError');
    if (state.kind === 'invalid') return t('sales.priceInvalidError');
    if (state.kind === 'negative') return t('sales.priceNegativeError');
    if (state.kind === 'zero') return t('sales.priceZeroError');
    if (state.kind === 'changed-manually') {
      return t('sales.priceChangedByManager');
    }
    if (state.kind === 'below-recommended') {
      return t('sales.priceBelowRecommendedWarning').replace(
        '{difference}',
        state.difference.toLocaleString('ru-RU'),
      );
    }
    if (state.kind === 'above-recommended') {
      return t('sales.priceAboveRecommendedRangeWarning').replace(
        '{difference}',
        state.difference.toLocaleString('ru-RU'),
      );
    }
    if (state.kind === 'below-minimum') {
      return t('sales.priceBelowMinimumError').replace(
        '{minimumPrice}',
        formatBoundPrice(state.boundary),
      );
    }
    return t('sales.priceAboveMaximumError').replace(
      '{maximumPrice}',
      formatBoundPrice(state.boundary),
    );
  }

  function restoreItemsFromDraft(sale: Sale) {
    if (!sale.items?.length) return;
    setItems((current) => {
      if (current.length === 0) {
        return sale.items!.map((item) => {
          const recommended =
            item.recommendedPriceSnapshot ?? item.resolvedPriceKgs ?? item.unitPrice;
          const minimum = item.minimumPriceSnapshot ?? recommended;
          const maximum = item.maximumPriceSnapshot ?? null;
          return {
            productId: item.productId ?? '',
            productName: item.productName,
            productSku: item.productSku ?? '',
            unit: '',
            quantity: String(item.quantity),
            listPrice: recommended,
            minimumPrice: minimum,
            recommendedPrice: recommended,
            maximumPrice: maximum,
            hasMaximumPrice: maximum != null && maximum > 0,
            discountPercent: '0',
            unitPrice: formatPriceInput(item.unitPrice),
            unitPriceManuallyEdited: Boolean(item.priceChangedManually),
            unitCost: '0',
            availableQty: item.quantity,
            maxDiscountPercent: 0,
            hasPricingPolicy: recommended > 0,
          } satisfies SaleItemForm;
        });
      }
      return current.map((line) => {
        const draftItem = sale.items?.find((item) => item.productId === line.productId);
        if (!draftItem) return line;
        return {
          ...line,
          unitPrice: formatPriceInput(draftItem.unitPrice),
          unitPriceManuallyEdited: Boolean(draftItem.priceChangedManually),
          minimumPrice: draftItem.minimumPriceSnapshot ?? line.minimumPrice,
          recommendedPrice:
            draftItem.recommendedPriceSnapshot ??
            draftItem.resolvedPriceKgs ??
            line.recommendedPrice,
          maximumPrice: draftItem.maximumPriceSnapshot ?? line.maximumPrice,
          hasMaximumPrice:
            (draftItem.maximumPriceSnapshot ?? line.maximumPrice) != null &&
            Number(draftItem.maximumPriceSnapshot ?? line.maximumPrice) > 0,
        };
      });
    });
  }

  async function finalizeSale() {
    if (
      draftSale &&
      (draftSale.status === 'FINALIZED' ||
        draftSale.status === 'CANCELLED' ||
        draftSale.status === 'WAITING_FOR_CASHIER_PAYMENT')
    ) {
      setError(t('sales.saleAlreadyCompleted'));
      return;
    }

    if (
      paymentType === 'FULL_PAYMENT' &&
      !branchCashierHandoffFlow &&
      (!paymentValidation.ok || !paymentComplete)
    ) {
      setError(formatPaymentError(paymentValidation));
      return;
    }

    if (installmentBlocksCompletion(draftSale, paymentType) && !installmentApproved) {
      setError(t('sales.installmentRequiresCeoApproval'));
      return;
    }

    setSaving(true);
    setError('');
    /* toast clear */ void 0;

    try {
      if (selectedCustomer) {
        const refreshedCustomer = await apiFetch<Customer>(`/customers/${selectedCustomer.id}`);
        const nextCustomer: SaleCustomerOption = {
          id: refreshedCustomer.id,
          fullName: refreshedCustomer.fullName,
          phone: refreshedCustomer.phone,
          whatsappPhone: refreshedCustomer.whatsappPhone,
          status: refreshedCustomer.status,
          customerType:
            refreshedCustomer.customerType === 'WHOLESALE'
              ? 'WHOLESALE'
              : refreshedCustomer.customerType === 'MASTER'
                ? 'MASTER'
                : 'RETAIL',
          loyaltyCategory:
            refreshedCustomer.loyaltyCategory ?? refreshedCustomer.customerCategory,
          customerCategory:
            refreshedCustomer.customerCategory ?? refreshedCustomer.loyaltyCategory,
          currentMarkupPercent: refreshedCustomer.currentMarkupPercent,
          currentAdditionalMarkup: refreshedCustomer.currentAdditionalMarkup,
          currentDiscountPercent: refreshedCustomer.currentDiscountPercent,
          totalDebtAmount: Number(refreshedCustomer.totalDebtAmount ?? 0),
          hasOverdueInstallment: selectedCustomer.hasOverdueInstallment,
        };
        if (nextCustomer.customerType !== selectedCustomer.customerType) {
          setSelectedCustomer(nextCustomer);
          await recalculateDraftPricesForCustomer(nextCustomer);
        }
      }

      const saved = await saveDraft();
      if (!saved) return;

      const finalized = await apiFetch<Sale>(`/sales/${saved.id}/finalize`, {
        method: 'POST',
      });
      setDraftSale(finalized);
      if (branchCashierHandoffFlow && paymentType === 'FULL_PAYMENT') {
        toast.success(t('sales.registeredSentToCashier'));
        router.push('/sales');
        return;
      }
      router.push(`/sales/${finalized.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelSale() {
    if (!draftSale) return;

    try {
      const cancelled = await apiFetch<Sale>(`/sales/${draftSale.id}/cancel`, {
        method: 'POST',
      });
      setDraftSale(cancelled);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={saveSale} className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {showPageTitle ? (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                {t('sales.registerSale')}
              </p>
            ) : null}
            <h2 className={`text-3xl font-bold text-slate-950 ${showPageTitle ? '' : 'mt-0'}`}>
              {draftSale ? `${t('sales.editDraft')} ${draftSale.receiptNumber}` : t('sales.registerSale')}
            </h2>
            {showPageTitle ? (
              <p className="mt-2 text-slate-500">
                {t('sales.registerSaleHint')}
              </p>
            ) : null}
          </div>
          {!branchSalesManagerView ? (
            <button
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              type="submit"
            >
              {saving ? t('common.loading') : t('sales.saveDraft')}
            </button>
          ) : null}
        </div>

        {loadingDraft ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {t('common.loading')}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </p>
        ) : null}
        {pricingPolicyWarning ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {pricingPolicyWarning}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {success}
          </p>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-950">{t('sales.customer')}</h3>
                {canCreateCustomerAction && !selectedCustomer ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateCustomer(true)}
                    className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    {t('sales.createCustomer')}
                  </button>
                ) : null}
              </div>
              <div className="mt-4">
                <SaleCustomerSearch
                  disabled={!!selectedCustomer}
                  includeArchived={includeArchivedCustomers}
                  onSelect={(customer) => void handleCustomerSelect(customer)}
                />
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeArchivedCustomers}
                  onChange={(event) => setIncludeArchivedCustomers(event.target.checked)}
                  className="rounded border-slate-300"
                />
                {t('sales.customerSearch.showArchived')}
              </label>
            </div>

            {selectedCustomer ? (
              <div className="min-w-72 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-950">{selectedCustomer.fullName}</p>
                    <p className="mt-1 text-sm text-slate-700">{selectedCustomer.phone}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {t('customers.customerType')}:{' '}
                      {t(customerTypeLabelKey(selectedCustomer.customerType))}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {t('customers.loyaltyCategory')}:{' '}
                      {t(
                        loyaltyCategoryLabelKey(
                          selectedCustomer.loyaltyCategory ?? selectedCustomer.customerCategory,
                        ),
                      )}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {t(`status.${selectedCustomer.status}`)}
                    </p>
                    {selectedCustomer.totalDebtAmount > 0 ? (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        {t('sales.debtAmount')}: {selectedCustomer.totalDebtAmount.toLocaleString('ru-RU')} KGS
                      </p>
                    ) : null}
                    {selectedCustomer.hasOverdueInstallment ? (
                      <p className="mt-2 text-sm font-semibold text-red-700">
                        {t('sales.customerSearch.overdue')}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-white"
                  >
                    {t('common.change')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {showCreateCustomer ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <h4 className="font-bold text-slate-900">{t('sales.createCustomer')}</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <SaleInput
                  label={t('crm.fullName')}
                  value={createCustomerForm.fullName}
                  onChange={(value) => setCreateCustomerForm((current) => ({ ...current, fullName: value }))}
                  required
                />
                <SaleInput
                  label={t('crm.phone')}
                  value={createCustomerForm.phone}
                  onChange={(value) => setCreateCustomerForm((current) => ({ ...current, phone: value }))}
                  required
                />
                <SaleInput
                  label={t('crm.whatsappPhone')}
                  value={createCustomerForm.whatsappPhone}
                  onChange={(value) =>
                    setCreateCustomerForm((current) => ({ ...current, whatsappPhone: value }))
                  }
                />
              </div>
              <div className="mt-3">
                <span className="text-sm font-semibold text-slate-700">
                  {t('customers.customerType')}
                </span>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      required
                      checked={createCustomerForm.customerType === 'RETAIL'}
                      onChange={() =>
                        setCreateCustomerForm((current) => ({ ...current, customerType: 'RETAIL' }))
                      }
                    />
                    {t('customers.customerTypeRetail')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      required
                      checked={createCustomerForm.customerType === 'MASTER'}
                      onChange={() =>
                        setCreateCustomerForm((current) => ({ ...current, customerType: 'MASTER' }))
                      }
                    />
                    {t('customers.customerTypeMaster')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      required
                      checked={createCustomerForm.customerType === 'WHOLESALE'}
                      onChange={() =>
                        setCreateCustomerForm((current) => ({ ...current, customerType: 'WHOLESALE' }))
                      }
                    />
                    {t('customers.customerTypeWholesale')}
                  </label>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={creatingCustomer}
                  onClick={() => void createCustomer()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingCustomer ? t('common.loading') : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCustomer(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('sales.saleItems')}</h3>

          <div className="mt-4">
            <SaleProductSearch
              disabled={!selectedCustomer}
              inputRef={productSearchRef}
              pricingChannel={appliedPricingChannel}
              onSelect={handleProductSelect}
              showRecommendedPriceLabel={branchSalesManagerView}
            />
          </div>

          {items.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {t('sales.productSearch.empty')}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((item, index) => {
                const itemTotal =
                  Number(item.quantity || 0) * Number(item.unitPrice || 0);
                const quantityError = Number(item.quantity || 0) > item.availableQty;
                const priceState = linePriceStates[index];

                return (
                  <div
                    key={`${item.productId}-${index}`}
                    className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,0.75fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-slate-400">{t('sales.product')}</p>
                      <p className="mt-1 break-words font-semibold text-slate-950">{item.productName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('sales.sku')}: {item.productSku} • {item.unit}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('sales.productSearch.available')}: {item.availableQty}
                      </p>
                    </div>
                    <SaleInput
                      label={t('sales.quantity')}
                      type="number"
                      value={item.quantity}
                      onChange={(value) => updateItem(index, { quantity: value })}
                      required
                      error={
                        quantityError
                          ? `${t('sales.insufficientStockDetail')} ${item.availableQty}.`
                          : undefined
                      }
                    />
                    <div className="min-w-0">
                      <SaleInput
                        label={t('sales.sellingPrice')}
                        type="number"
                        value={item.unitPrice}
                        onChange={(value) => updateItem(index, { unitPrice: value })}
                        required
                        step="0.01"
                        min={0}
                        readOnly={!canEditSalePrice}
                        labelAccessory={
                          <SaleLinePricingTooltip
                            minimumPrice={item.minimumPrice}
                            recommendedPrice={item.recommendedPrice}
                            maximumPrice={item.maximumPrice}
                            hasMaximumPrice={item.hasMaximumPrice}
                            hasPricingPolicy={item.hasPricingPolicy}
                          />
                        }
                        error={
                          !item.hasPricingPolicy
                            ? t('sales.priceNotConfigured')
                            : priceState?.level === 'error'
                              ? priceWarningMessage(priceState) ?? undefined
                              : undefined
                        }
                      />
                      {item.hasPricingPolicy &&
                      (item.unitPriceManuallyEdited || priceState?.kind === 'changed-manually') ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          {t('sales.priceChangedByManager')}
                        </p>
                      ) : null}
                    </div>
                    {item.maxDiscountPercent > 0 && !branchSalesManagerView ? (
                      <SaleInput
                        label={t('sales.discountPercent')}
                        type="number"
                        value={item.discountPercent}
                        onChange={(value) => updateItem(index, { discountPercent: value })}
                      />
                    ) : null}
                    <div className="flex min-w-0 flex-col justify-center gap-1 rounded-xl bg-slate-50 px-3 py-3 text-sm">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        {t('sales.totalAmount')}
                      </p>
                      <p className="font-bold text-slate-900">{formatKgs(itemTotal)}</p>
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      type="button"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('sales.paymentSection')}</h3>

          <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block min-w-0">
              <span className="text-sm font-semibold text-slate-700">{t('sales.paymentType')}</span>
              <select
                value={paymentType}
                onChange={(event) => {
                  const next = event.target.value as PaymentType;
                  setPaymentType(next);
                  setPaymentsSynced(false);
                  if (next === 'FULL_PAYMENT') {
                    setIsReceivedAmountManuallyEdited(false);
                    setPaymentRows(buildFullPaymentRows(totals.totalAmount));
                  } else {
                    setIsReceivedAmountManuallyEdited(false);
                    setDownPayment('');
                    setPaymentRows([createPaymentPartRow({ method: 'CASH' })]);
                  }
                }}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="FULL_PAYMENT">{t('sales.fullPayment')}</option>
                <option value="INSTALLMENT">{t('sales.installment')}</option>
              </select>
            </label>

            {paymentType === 'FULL_PAYMENT' ? null : (
              <>
                <SaleInput
                  label={t('sales.downPayment')}
                  type="number"
                  value={downPayment}
                  onChange={(value) => {
                    setDownPayment(value);
                    setPaymentsSynced(false);
                  }}
                />
                <div className="min-w-0 rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {t('sales.installmentFinancedAmount')}
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatKgs(installmentRemainingDebt)}
                  </p>
                </div>
                <SaleInput
                  label={t('sales.finalPaymentDate')}
                  type="date"
                  value={finalPaymentDate}
                  onChange={setFinalPaymentDate}
                />
                {!branchSalesManagerView ? (
                  <label className="block min-w-0">
                    <span className="text-sm font-semibold text-slate-700">{t('sales.downPaymentMethod')}</span>
                    <select
                      value={paymentRows[0]?.method ?? ''}
                      onChange={(event) =>
                        updatePayment(0, { method: event.target.value as PaymentMethod })
                      }
                      required
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    >
                      <option value="">{t('sales.paymentMethodRequired')}</option>
                      {SALE_PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {formatPaymentMethodLabel(method, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="block min-w-0 sm:col-span-2 lg:col-span-4">
                  <span className="text-sm font-semibold text-slate-700">{t('sales.installmentComment')}</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
              </>
            )}
          </div>

          {paymentType === 'FULL_PAYMENT' ? (
            <div className="mt-6 space-y-4">
              {branchCashierHandoffFlow ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Summary label={t('sales.paymentSummaryTotal')} value={formatKgs(totals.totalAmount)} />
                </div>
              ) : paymentRows.length === 1 ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="block min-w-0">
                    <span className="text-sm font-semibold text-slate-700">
                      {t('sales.paymentMethod')}
                    </span>
                    <select
                      value={paymentRows[0]?.method ?? 'CASH'}
                      onChange={(event) =>
                        updatePayment(0, { method: event.target.value as PaymentMethod })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    >
                      {SALE_PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {formatPaymentMethodLabel(method, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {paymentRows[0]?.method === 'CASH' ? (
                    <SaleInput
                      label={t('sales.cashReceived')}
                      type="number"
                      value={paymentRows[0].cashReceived}
                      onChange={(value) => updatePayment(0, { cashReceived: value })}
                      required
                    />
                  ) : (
                    <SaleInput
                      label={t('sales.paidAmount')}
                      type="number"
                      value={paymentRows[0]?.amount ?? ''}
                      onChange={(value) => updatePayment(0, { amount: value })}
                      required
                    />
                  )}
                </div>
              ) : (
                paymentRows.map((row, index) => {
                  const methods = availableMethodsForRow(
                    paymentRows,
                    index,
                    SALE_PAYMENT_METHODS,
                  );

                  return (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-900">
                          {t('sales.paymentPart')} {index + 1}
                        </p>
                        {paymentRows.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removePaymentRow(index)}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            {t('common.delete')}
                          </button>
                        ) : null}
                      </div>
                      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <label className="block min-w-0">
                          <span className="text-sm font-semibold text-slate-700">
                            {t('sales.paymentMethod')}
                          </span>
                          <select
                            value={row.method}
                            onChange={(event) =>
                              updatePayment(index, {
                                method: event.target.value as PaymentMethod,
                              })
                            }
                            required
                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                          >
                            <option value="">{t('sales.paymentMethodRequired')}</option>
                            {methods.map((method) => (
                              <option key={method} value={method}>
                                {formatPaymentMethodLabel(method, t)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {row.method === 'CASH' ? (
                          <SaleInput
                            label={t('sales.cashReceived')}
                            type="number"
                            value={row.cashReceived}
                            onChange={(value) =>
                              updatePayment(index, { cashReceived: value })
                            }
                            required
                          />
                        ) : (
                          <SaleInput
                            label={t('sales.paidAmount')}
                            type="number"
                            value={row.amount}
                            onChange={(value) => updatePayment(index, { amount: value })}
                            required
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
                <p>
                  <span className="font-semibold">{t('sales.paymentSummaryTotal')}:</span>{' '}
                  {formatKgs(totals.totalAmount)}
                </p>
                {totals.paidTotal > 0.009 && !branchCashierHandoffFlow ? (
                  <p className="mt-1">
                    <span className="font-semibold">{t('sales.paymentSummaryPaid')}:</span>{' '}
                    {formatKgs(totals.paidTotal)}
                  </p>
                ) : null}
                {!branchCashierHandoffFlow && totals.remainingAmount > 0.009 ? (
                  <p className="mt-1 font-semibold text-amber-800">
                    {t('sales.paymentSummaryRemaining')}: {formatKgs(totals.remainingAmount)}
                  </p>
                ) : null}
                {totals.cashShortage > 0.009 ? (
                  <p className="mt-1 font-semibold text-red-700">
                    {t('sales.insufficientCash').replace(
                      '{amount}',
                      totals.cashShortage.toLocaleString('ru-RU'),
                    )}
                  </p>
                ) : null}
                {paymentComplete && totals.totalCashChange > 0.009 ? (
                  <p className="mt-1 font-semibold text-green-700">
                    {t('sales.changeAmount')}: {formatKgs(totals.totalCashChange)}
                  </p>
                ) : null}
                {paymentComplete &&
                paymentRows.some((row) => row.method === 'CASH') &&
                totals.totalCashChange <= 0.009 &&
                totals.totalAmount > 0 ? (
                  <p className="mt-1 font-semibold text-green-700">{t('sales.noChange')}</p>
                ) : null}
              </div>

              {paymentRows.length < SALE_PAYMENT_METHODS.length && !branchCashierHandoffFlow ? (
                <button
                  type="button"
                  onClick={addPaymentRow}
                  className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:w-auto"
                >
                  {t('sales.addPaymentMethod')}
                </button>
              ) : null}
            </div>
          ) : null}

          {paymentType === 'FULL_PAYMENT' &&
          !branchCashierHandoffFlow &&
          !paymentValidation.ok ? (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {formatPaymentError(paymentValidation)}
            </p>
          ) : null}


          {paymentType === 'INSTALLMENT' && isInstallmentSale && installmentStatusKey ? (
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                installmentApproved
                  ? 'bg-green-50 text-green-800'
                  : installmentRejected || installmentCancelled
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-800'
              }`}
            >
              {t(installmentStatusKey)}
              {(installmentRejected || installmentCancelled) && installmentApproval?.rejectionReason
                ? `: ${installmentApproval.rejectionReason}`
                : ''}
            </p>
          ) : null}

          {paymentType !== 'FULL_PAYMENT' ? (
            <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label={t('sales.paymentSummaryTotal')} value={formatKgs(totals.totalAmount)} />
              <Summary label={t('sales.downPayment')} value={formatKgs(Number(downPayment || 0))} />
              <Summary
                label={t('sales.installmentFinancedAmount')}
                value={formatKgs(installmentRemainingDebt)}
              />
            </div>
          ) : null}

          <div className="mt-6 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {!branchSalesManagerView ? (
              <button
                onClick={() => void saveDraft()}
                type="button"
                className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:w-auto"
              >
                {t('sales.saveDraft')}
              </button>
            ) : null}
            {!branchSalesManagerView ? (
              <button
                onClick={() => void sendWhatsApp()}
                type="button"
                className="w-full rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 sm:w-auto"
              >
                {t('sales.sendWhatsApp')}
              </button>
            ) : null}
            {paymentType === 'INSTALLMENT' && canSubmitInstallment && isInstallmentDraft ? (
              <button
                onClick={() => void submitInstallmentRequest()}
                disabled={submittingInstallment || installmentPending || installmentApproved}
                type="button"
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300 sm:w-auto"
              >
                {submittingInstallment
                  ? t('common.loading')
                  : t('sales.submitInstallmentRequest')}
              </button>
            ) : null}
            {paymentType === 'FULL_PAYMENT' ? (
              <button
                onClick={() => void finalizeSale()}
                disabled={!canFinalize || saving}
                type="button"
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
              >
                {saving ? t('common.loading') : t('sales.finalizeSale')}
              </button>
            ) : installmentApproved ? (
              <button
                onClick={() => void finalizeSale()}
                disabled={!canFinalize || saving}
                type="button"
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
              >
                {saving ? t('common.loading') : t('sales.finalizeSale')}
              </button>
            ) : null}
            <button
              onClick={() => void cancelSale()}
              disabled={!draftSale || draftSale.status === 'CANCELLED'}
              type="button"
              className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
            >
              {t('sales.cancelSale')}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('sales.draftReceipt')}</h3>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
            {draftSale?.draftReceiptText ??
              (paymentType === 'FULL_PAYMENT'
                ? `EMOTORS DRAFT RECEIPT\n${t('sales.totalAmount')}: ${formatKgs(totals.totalAmount)}\n${t('sales.paidAmount')}: ${formatKgs(fullPaymentReceivedAmount)}${fullPaymentChange.changeAmount > 0.009 ? `\n${t('sales.changeAmount')}: ${formatKgs(fullPaymentChange.changeAmount)}` : ''}`
                : `EMOTORS DRAFT RECEIPT\n${t('sales.totalAmount')}: ${formatKgs(totals.totalAmount)}\n${t('sales.paidAmount')}: ${formatKgs(totals.paidTotal)}\n${t('sales.debtAmount')}: ${formatKgs(totals.remainingAmount)}`)}
          </pre>
          {draftSale ? (
            <p className="mt-3 inline-flex rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {getStatusLabel({ module: 'sale', status: draftSale.status, t })}
            </p>
          ) : null}
        </section>
      </form>
    </ProtectedShell>
  );
}

function SaleInput({
  label,
  labelAccessory,
  value,
  onChange,
  required,
  type = 'text',
  readOnly,
  error,
  min,
  step,
}: {
  label: string;
  labelAccessory?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
  error?: string;
  min?: number | string;
  step?: number | string;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-center gap-1 text-sm font-semibold text-slate-700">
        <span className="truncate">{label}</span>
        {labelAccessory}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        readOnly={readOnly}
        type={type}
        min={min ?? (type === 'number' ? 0 : undefined)}
        step={step ?? (type === 'number' ? '0.01' : undefined)}
        className={`mt-2 w-full min-w-0 rounded-xl border px-3 py-2 outline-none ring-blue-500 focus:ring-2 ${
          readOnly ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-slate-300'
        } ${error ? 'border-red-300' : ''}`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} KGS`;
}
