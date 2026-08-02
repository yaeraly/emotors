'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { CenteredDialog } from '@/components/CenteredDialog';
import { apiFetch } from '@/lib/api';
import { shouldHideCustomerProfit, canEditCustomerType, canSendCustomerPriceList } from '@/lib/rbac';
import { customerTypeLabelKey, loyaltyCategoryLabelKey } from '@/lib/sale-customer-pricing';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';
import { SendPriceListModal } from '@/components/customers/SendPriceListModal';
import type {
  Customer,
  CustomerEvent,
  CustomerEventType,
  CustomerType,
  FollowUp,
  PurchaseHistoryRow,
  ServiceHistory,
  TimelineEntry,
  User,
} from '@/lib/types';

const eventTypes: CustomerEventType[] = [
  'NOTE',
  'CALL',
  'WHATSAPP',
  'VISIT',
  'SALE',
  'SERVICE',
  'FOLLOW_UP',
];

type TimelineResponse = {
  customer: Customer;
  events: CustomerEvent[];
  whatsappEvents: CustomerEvent[];
  followUps: FollowUp[];
  purchaseHistory: PurchaseHistoryRow[];
  serviceHistory: ServiceHistory;
  timeline: TimelineEntry[];
};

export default function CustomerDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [events, setEvents] = useState<CustomerEvent[]>([]);
  const [whatsappEvents, setWhatsappEvents] = useState<CustomerEvent[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryRow[]>(
    [],
  );
  const [serviceHistory, setServiceHistory] = useState<ServiceHistory>({
    diagnostics: [],
    repairs: [],
    warrantyRecords: [],
  });
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [eventType, setEventType] = useState<CustomerEventType>('NOTE');
  const [eventMessage, setEventMessage] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const [followUpDueAt, setFollowUpDueAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    whatsappPhone: '',
    status: 'ACTIVE',
    customerType: 'RETAIL' as CustomerType,
    notes: '',
  });
  const [activeDialog, setActiveDialog] = useState<'reminder' | 'event' | 'whatsapp' | null>(
    null,
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [priceListModalOpen, setPriceListModalOpen] = useState(false);

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(setCurrentUser)
      .catch(() => null);
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function loadDetail() {
    setLoading(true);
    setError('');

    try {
      const result = await apiFetch<TimelineResponse>(
        `/customers/${customerId}/timeline`,
      );
      setCustomer(result.customer);
      setEditForm({
        fullName: result.customer.fullName,
        phone: result.customer.phone,
        whatsappPhone: result.customer.whatsappPhone ?? '',
        status: result.customer.status,
        customerType: result.customer.customerType ?? 'RETAIL',
        notes: result.customer.notes ?? '',
      });
      setEvents(result.events);
      setWhatsappEvents(result.whatsappEvents);
      setFollowUps(result.followUps);
      setPurchaseHistory(result.purchaseHistory ?? []);
      setServiceHistory(
        result.serviceHistory ?? {
          diagnostics: [],
          repairs: [],
          warrantyRecords: [],
        },
      );
      setTimeline(result.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/customers/${customerId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: eventType,
        message: eventMessage,
      }),
    });
    setEventMessage('');
    setActiveDialog(null);
    await loadDetail();
  }

  async function addFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/customers/${customerId}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify({
        title: followUpTitle,
        description: followUpDescription || undefined,
        dueAt: new Date(followUpDueAt).toISOString(),
      }),
    });
    setFollowUpTitle('');
    setFollowUpDescription('');
    setFollowUpDueAt('');
    setActiveDialog(null);
    await loadDetail();
  }

  async function markDone(followUpId: string) {
    await apiFetch(`/customers/${customerId}/follow-ups/${followUpId}/done`, {
      method: 'PUT',
    });
    await loadDetail();
  }

  async function saveCustomerEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm.fullName.trim() || !editForm.phone.trim()) {
      setEditError('Full name and phone are required');
      return;
    }

    setEditSaving(true);
    setEditError('');

    try {
      await apiFetch(`/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          whatsappPhone: editForm.whatsappPhone.trim() || undefined,
          status: editForm.status,
          ...(canEditCustomerType(currentUser)
            ? { customerType: editForm.customerType }
            : {}),
          notes: editForm.notes.trim() || undefined,
        }),
      });
      setIsEditing(false);
      await loadDetail();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setEditSaving(false);
    }
  }

  const canEditProfile = Boolean(currentUser);
  const canEditType = canEditCustomerType(currentUser);
  const canSendPriceList = canSendCustomerPriceList(currentUser);
  const hideCustomerProfit = shouldHideCustomerProfit(currentUser);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link
          href="/customers"
          className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          {t('nav.customers')}
        </Link>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
            {t('common.loading')}
          </p>
        ) : customer ? (
          <>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col justify-between gap-4 lg:flex-row">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                      {t('crm.personalInformation')}
                    </p>
                    <h2 className="mt-2 text-3xl font-bold text-slate-950">
                      {customer.fullName}
                    </h2>
                    <p className="mt-2 text-slate-500">{customer.notes}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="h-fit rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700">
                      {getStatusLabel({ module: 'customer', status: customer.status, t })}
                    </span>
                    {canEditProfile ? (
                      <button
                        type="button"
                        onClick={() => setIsEditing((value) => !value)}
                        className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        {isEditing ? t('common.cancel') : t('common.edit')}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveDialog('reminder')}
                    className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    {t('crm.addFollowUp')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDialog('event')}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('crm.addEvent')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDialog('whatsapp')}
                    className="rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50"
                  >
                    {t('crm.whatsappHistory')}
                  </button>
                  {canSendPriceList ? (
                    <button
                      type="button"
                      onClick={() => setPriceListModalOpen(true)}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      {t('crm.sendPriceList')}
                    </button>
                  ) : null}
                </div>

                {isEditing ? (
                  <form onSubmit={saveCustomerEdits} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">{t('crm.fullName')}</span>
                        <input
                          value={editForm.fullName}
                          onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">{t('crm.phone')}</span>
                        <input
                          value={editForm.phone}
                          onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">{t('crm.whatsappPhone')}</span>
                        <input
                          value={editForm.whatsappPhone}
                          onChange={(event) => setEditForm({ ...editForm, whatsappPhone: event.target.value })}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">{t('crm.status')}</span>
                        <select
                          value={editForm.status}
                          onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                        >
                          {['ACTIVE', 'VIP', 'RISK', 'INACTIVE', 'NEW', 'SLEEPING'].map((item) => (
                            <option key={item} value={item}>
                              {t(`status.${item}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {canEditType ? (
                        <div className="block md:col-span-2">
                          <span className="text-sm font-semibold text-slate-700">
                            {t('customers.customerType')} *
                          </span>
                          <div className="mt-2 flex flex-wrap gap-4 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                required
                                checked={editForm.customerType === 'RETAIL'}
                                onChange={() =>
                                  setEditForm({ ...editForm, customerType: 'RETAIL' })
                                }
                              />
                              {t('customers.customerTypeRetail')}
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                required
                                checked={editForm.customerType === 'MASTER'}
                                onChange={() =>
                                  setEditForm({ ...editForm, customerType: 'MASTER' })
                                }
                              />
                              {t('customers.customerTypeMaster')}
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                required
                                checked={editForm.customerType === 'WHOLESALE'}
                                onChange={() =>
                                  setEditForm({ ...editForm, customerType: 'WHOLESALE' })
                                }
                              />
                              {t('customers.customerTypeWholesale')}
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
                      <textarea
                        value={editForm.notes}
                        onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                        className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </label>
                    {editError ? (
                      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{editError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={editSaving}
                      className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {editSaving ? t('common.loading') : t('common.save')}
                    </button>
                  </form>
                ) : null}

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Info label={t('crm.fullName')} value={customer.fullName} />
                  <Info label={t('crm.phone')} value={customer.phone} />
                  <Info
                    label={t('crm.whatsappPhone')}
                    value={customer.whatsappPhone ?? '-'}
                  />
                  <Info
                    label={t('crm.branch')}
                    value={customer.branch?.name ?? customer.branchId}
                  />
                  <Info label={t('crm.status')} value={t(`status.${customer.status}`)} />
                  <Info
                    label={t('customers.customerType')}
                    value={t(customerTypeLabelKey(customer.customerType))}
                  />
                  <Info
                    label={t('customers.loyaltyCategory')}
                    value={t(
                      loyaltyCategoryLabelKey(
                        (customer as { loyaltyCategory?: string; customerCategory?: string })
                          .loyaltyCategory ??
                          (customer as { customerCategory?: string }).customerCategory,
                      ),
                    )}
                  />
                  <Info
                    label={t('customers.currentAdditionalMarkup')}
                    value={`${Number(
                      (customer as { currentMarkupPercent?: number; currentAdditionalMarkup?: number })
                        .currentMarkupPercent ??
                        (customer as { currentAdditionalMarkup?: number }).currentAdditionalMarkup ??
                        (customer as { currentDiscountPercent?: number }).currentDiscountPercent ??
                        0,
                    )}%`}
                  />
                  <Info
                    label={t('customers.finalPriceType')}
                    value={t(customerTypeLabelKey(customer.customerType))}
                  />
                  <Info
                    label={t('customers.lastPurchaseDate')}
                    value={
                      customer.lastPurchaseDate
                        ? new Date(customer.lastPurchaseDate).toLocaleDateString()
                        : '-'
                    }
                  />
                  <Info
                    label={t('common.createdDate')}
                    value={new Date(customer.createdAt).toLocaleDateString()}
                  />
                </div>

                <h3 className="mt-8 text-lg font-bold text-slate-950">
                  {t('crm.financialSummary')}
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <Amount
                    label={t('crm.totalPurchaseAmount')}
                    value={customer.totalPurchases}
                  />
                  <Amount
                    label={t('customers.purchaseVolume90Days')}
                    value={Number(
                      (customer as { purchaseVolume?: number }).purchaseVolume ??
                        customer.totalPurchases ??
                        0,
                    )}
                  />
                  {!hideCustomerProfit ? (
                    <Amount label={t('crm.totalProfitAmount')} value={customer.totalProfit} />
                  ) : null}
                  <Amount label={t('crm.totalDebtAmount')} value={customer.totalDebt} />
                  <Amount
                    label={t('sales.paidAmount')}
                    value={
                      customer.totalPayments ??
                      Math.max(customer.totalPurchases - customer.totalDebt, 0)
                    }
                  />
                  <Amount
                    label="Average order"
                    value={
                      customer.averageOrderValue ??
                      (customer.purchaseCount > 0
                        ? customer.totalPurchases / customer.purchaseCount
                        : 0)
                    }
                  />
                </div>
              </article>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">
                    {t('crm.purchaseHistory')}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Invoice-level rows will be populated from the Sales module
                    when it is implemented.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                  {purchaseHistory.length} records
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('common.date')}</th>
                      <th className="px-4 py-3">Invoice Number</th>
                      <th className="px-4 py-3">Products</th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Total Amount</th>
                      {!hideCustomerProfit ? <th className="px-4 py-3">Profit</th> : null}
                      <th className="px-4 py-3">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseHistory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hideCustomerProfit ? 6 : 7}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          {t('crm.noPurchaseRows')}
                        </td>
                      </tr>
                    ) : (
                      purchaseHistory.map((purchase) => (
                        <tr key={purchase.id}>
                          <td className="px-4 py-3">
                            {new Date(purchase.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {purchase.invoiceNumber}
                          </td>
                          <td className="px-4 py-3">{purchase.products}</td>
                          <td className="px-4 py-3">
                            {purchase.quantity ?? t('crm.notLinked')}
                          </td>
                          <td className="px-4 py-3">
                            {formatKgs(purchase.totalAmount)}
                          </td>
                          {!hideCustomerProfit ? (
                            <td className="px-4 py-3">
                              {formatKgs(purchase.profit)}
                            </td>
                          ) : null}
                          <td className="px-4 py-3">
                            {t(`paymentStatus.${purchase.paymentStatus}`)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">
                {t('crm.serviceHistory')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Diagnostics, repairs, and warranty records will be fully
                populated when the Service module is added.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <HistoryBucket
                  title="Diagnostics"
                  empty={t('service.noDiagnostics')}
                  items={serviceHistory.diagnostics}
                />
                <HistoryBucket
                  title="Repairs"
                  empty={t('service.noRepairs')}
                  items={serviceHistory.repairs}
                />
                <HistoryBucket
                  title="Warranty records"
                  empty={t('service.noWarranty')}
                  items={serviceHistory.warrantyRecords}
                />
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">{t('crm.timeline')}</h3>
                <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-2">
                  {timeline.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-6 text-center text-slate-500">
                      {t('crm.timeline')}
                    </p>
                  ) : (
                    timeline.map((entry) => (
                      <TimelineRow key={`${entry.kind}-${entry.item.id}`} entry={entry} />
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <Panel title={t('crm.followUps')}>
                  {followUps.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {t('crm.followUps')}
                    </p>
                  ) : (
                    followUps.map((followUp) => (
                      <div
                        key={followUp.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-900">
                              {followUp.title}
                            </p>
                            <p className="text-sm text-slate-500">
                              {new Date(followUp.dueAt).toLocaleString()}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                            {getStatusLabel({ module: 'followUp', status: followUp.status, t })}
                          </span>
                        </div>
                        {followUp.description ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {followUp.description}
                          </p>
                        ) : null}
                        {followUp.status === 'OPEN' ? (
                          <button
                            onClick={() => void markDone(followUp.id)}
                            className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            type="button"
                          >
                            {t('crm.markDone')}
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </Panel>
              </section>
            </div>

            <section className="hidden">
              {events.length}
            </section>

            <CenteredDialog
              open={activeDialog === 'reminder'}
              title={t('crm.addFollowUp')}
              onClose={() => setActiveDialog(null)}
            >
              <form onSubmit={addFollowUp} className="space-y-3">
                <input
                  value={followUpTitle}
                  onChange={(event) => setFollowUpTitle(event.target.value)}
                  placeholder="Title"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  required
                />
                <textarea
                  value={followUpDescription}
                  onChange={(event) => setFollowUpDescription(event.target.value)}
                  placeholder="Description"
                  className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                />
                <input
                  value={followUpDueAt}
                  onChange={(event) => setFollowUpDueAt(event.target.value)}
                  type="datetime-local"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  required
                />
                <button
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                  type="submit"
                >
                  {t('crm.addFollowUp')}
                </button>
              </form>
            </CenteredDialog>

            <CenteredDialog
              open={activeDialog === 'event'}
              title={t('crm.addEvent')}
              onClose={() => setActiveDialog(null)}
            >
              <form onSubmit={addEvent} className="space-y-3">
                <select
                  value={eventType}
                  onChange={(event) =>
                    setEventType(event.target.value as CustomerEventType)
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                >
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <textarea
                  value={eventMessage}
                  onChange={(event) => setEventMessage(event.target.value)}
                  placeholder="Write event details"
                  className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  required
                />
                <button
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
                  type="submit"
                >
                  {t('crm.addEvent')}
                </button>
              </form>
            </CenteredDialog>

            <CenteredDialog
              open={activeDialog === 'whatsapp'}
              title={t('crm.whatsappHistory')}
              onClose={() => setActiveDialog(null)}
              wide
            >
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {whatsappEvents.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    {t('crm.whatsappHistory')}
                  </p>
                ) : (
                  whatsappEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-950"
                    >
                      <p>{event.message}</p>
                      <p className="mt-2 text-xs text-green-700">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CenteredDialog>
          </>
        ) : null}
      </section>
      <SendPriceListModal
        open={priceListModalOpen}
        initialCustomerId={customerId}
        onClose={() => setPriceListModalOpen(false)}
      />
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Amount({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-950">
        {formatKgs(value)}
      </p>
    </div>
  );
}

function HistoryBucket({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; date: string; description: string }>;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <h4 className="font-bold text-slate-950">{title}</h4>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">{empty}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl bg-white p-3 text-sm">
              <p className="font-semibold text-slate-900">{item.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(item.date).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { t } = useTranslation();

  if (entry.kind === 'event') {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              {entry.item.type}
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {entry.item.message}
            </p>
          </div>
          <time className="shrink-0 text-right text-xs text-slate-500">
            {new Date(entry.at).toLocaleString()}
          </time>
        </div>
      </div>
    );
  }

  if (entry.kind === 'sale') {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              {t('crm.purchaseHistory')} · {t(`paymentStatus.${entry.item.paymentStatus}`)}
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {entry.item.receiptNumber} · {formatKgs(entry.item.totalAmount)}
            </p>
          </div>
          <time className="shrink-0 text-right text-xs text-slate-500">
            {new Date(entry.at).toLocaleString()}
          </time>
        </div>
      </div>
    );
  }

  if (entry.kind === 'payment') {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">
              {t('sales.payments')} · {entry.item.method}
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {entry.item.receiptNumber} · {formatKgs(entry.item.amount)}
            </p>
          </div>
          <time className="shrink-0 text-right text-xs text-slate-500">
            {new Date(entry.at).toLocaleString()}
          </time>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
            FOLLOW_UP · {entry.item.status}
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {entry.item.title}
          </p>
          {entry.item.description ? (
            <p className="mt-1 text-sm text-slate-600">
              {entry.item.description}
            </p>
          ) : null}
        </div>
        <time className="shrink-0 text-right text-xs text-slate-500">
          {new Date(entry.at).toLocaleString()}
        </time>
      </div>
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} KGS`;
}
