'use client';

import { useEffect, useState } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type SearchCustomer = {
  id: string;
  fullName: string;
  phone: string;
  whatsappPhone?: string | null;
  customerType: string;
  customerTypeLabel: string;
  loyaltyCategory: string;
  loyaltyCategoryLabel: string;
  purchaseVolume90Days?: number;
  status: string;
  branchId: string;
  branchName: string;
};

/** Customer-facing preview / generated document payload. */
type PriceListPreview = {
  priceListId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerType: string;
  customerTypeLabel: string;
  branchName: string;
  branchPhone?: string | null;
  branchAddress?: string | null;
  title: string;
  generatedAt: string;
  validityNote?: string;
  productCount: number;
  fileUrl?: string | null;
  fileName?: string | null;
  whatsappApiAvailable: boolean;
  whatsappRequiresManualPdfAttachment?: boolean;
  products: Array<{
    productId: string;
    name: string;
    unit: string | null;
    photoUrl?: string | null;
    finalPriceKgs: number;
    currency: string;
  }>;
};

type WhatsAppResult = {
  whatsappLink: string;
  whatsappMessageText: string;
  fileUrl?: string | null;
  fileName?: string | null;
  whatsappApiAvailable: boolean;
  whatsappRequiresManualPdfAttachment: boolean;
};

export function SendPriceListModal({
  open,
  initialCustomerId,
  onClose,
}: {
  open: boolean;
  initialCustomerId?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchCustomer[]>([]);
  const [selected, setSelected] = useState<SearchCustomer | null>(null);
  const [preview, setPreview] = useState<PriceListPreview | null>(null);
  const [generated, setGenerated] = useState<PriceListPreview | null>(null);
  const [whatsappHint, setWhatsappHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setWhatsappHint('');
    setPreview(null);
    setGenerated(null);
    if (initialCustomerId) {
      void loadCustomerAndPreview(initialCustomerId);
    } else {
      setSelected(null);
      setSearch('');
      setResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCustomerId]);

  useEffect(() => {
    if (!open || selected || initialCustomerId) return;
    const handle = window.setTimeout(() => {
      void runSearch(search);
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open, selected, initialCustomerId]);

  async function runSearch(term: string) {
    try {
      const data = await apiFetch<SearchCustomer[]>(
        `/customer-price-lists/customers/search?search=${encodeURIComponent(term.trim())}`,
      );
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function loadCustomerAndPreview(customerId: string) {
    setLoading(true);
    setError('');
    try {
      const [found, previewData] = await Promise.all([
        apiFetch<SearchCustomer[]>(
          `/customer-price-lists/customers/search?search=${encodeURIComponent(customerId)}`,
        ),
        apiFetch<PriceListPreview>(`/customer-price-lists/customers/${customerId}/preview`, {
          method: 'POST',
        }),
      ]);
      const customer = found.find((row) => row.id === customerId) ?? null;
      setSelected(
        customer ?? {
          id: previewData.customerId,
          fullName: previewData.customerName,
          phone: previewData.customerPhone ?? '',
          customerType: previewData.customerType,
          customerTypeLabel: previewData.customerTypeLabel,
          loyaltyCategory: '',
          loyaltyCategoryLabel: '',
          status: 'ACTIVE',
          branchId: '',
          branchName: previewData.branchName,
        },
      );
      setPreview(previewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function selectCustomer(customer: SearchCustomer) {
    setSelected(customer);
    setLoading(true);
    setError('');
    setGenerated(null);
    setWhatsappHint('');
    try {
      const previewData = await apiFetch<PriceListPreview>(
        `/customer-price-lists/customers/${customer.id}/preview`,
        { method: 'POST' },
      );
      setPreview(previewData);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function ensureGenerated(): Promise<string | null> {
    if (generated?.priceListId) return generated.priceListId;
    if (!selected) return null;
    const data = await apiFetch<PriceListPreview>(
      `/customer-price-lists/customers/${selected.id}/generate`,
      { method: 'POST' },
    );
    setGenerated(data);
    setPreview(data);
    return data.priceListId ?? null;
  }

  async function downloadPdf() {
    if (!preview || loading) return;
    setLoading(true);
    setError('');
    try {
      const id = await ensureGenerated();
      if (!id) throw new Error(t('common.error'));

      const token = getToken();
      const response = await fetch(`${API_URL}/customer-price-lists/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(t('common.error'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = generated?.fileName ?? `price-list-${id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function sendWhatsApp() {
    if (!preview || loading) return;
    setLoading(true);
    setError('');
    setWhatsappHint('');
    try {
      const id = await ensureGenerated();
      if (!id) throw new Error(t('common.error'));

      const result = await apiFetch<WhatsAppResult>(
        `/customer-price-lists/${id}/whatsapp`,
        { method: 'POST' },
      );

      if (!result.whatsappApiAvailable) {
        setWhatsappHint(t('crm.priceListWhatsAppManualHint'));
        const token = getToken();
        const response = await fetch(`${API_URL}/customer-price-lists/${id}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = generated?.fileName ?? `price-list-${id}.pdf`;
          anchor.click();
          URL.revokeObjectURL(url);
        }
      }

      window.open(result.whatsappLink, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4">
      <div className="mt-8 w-full max-w-4xl rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t('crm.sendPriceList')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('crm.sendPriceListHint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:bg-slate-50"
          >
            x
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {whatsappHint ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {whatsappHint}
          </p>
        ) : null}

        {!selected ? (
          <div className="mt-5">
            <label className="block text-sm font-semibold text-slate-700">
              {t('crm.priceListCustomerSearch')}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('crm.priceListCustomerSearchPlaceholder')}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
              />
            </label>
            <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('crm.fullName')}</th>
                    <th className="px-3 py-2">{t('crm.phone')}</th>
                    <th className="px-3 py-2">{t('customers.customerType')}</th>
                    <th className="px-3 py-2">{t('customers.loyaltyCategory')}</th>
                    <th className="px-3 py-2">{t('customers.purchaseVolume90Days')}</th>
                    <th className="px-3 py-2">{t('crm.branch')}</th>
                    <th className="px-3 py-2">{t('crm.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => void selectCustomer(customer)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">{customer.fullName}</td>
                      <td className="px-3 py-2 text-slate-600">{customer.phone}</td>
                      <td className="px-3 py-2 text-slate-600">{customer.customerTypeLabel}</td>
                      <td className="px-3 py-2 text-slate-600">{customer.loyaltyCategoryLabel}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {(customer.purchaseVolume90Days ?? 0).toLocaleString('ru-RU')} KGS
                      </td>
                      <td className="px-3 py-2 text-slate-600">{customer.branchName}</td>
                      <td className="px-3 py-2 text-slate-600">{t(`status.${customer.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  {t('crm.noCustomers')}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="text-base font-bold text-slate-950">EMOTORS</p>
              <p>
                <span className="font-semibold">{t('crm.branch')}:</span>{' '}
                {preview?.branchName ?? selected.branchName}
              </p>
              {preview?.branchPhone ? (
                <p>
                  <span className="font-semibold">{t('crm.phone')}:</span> {preview.branchPhone}
                </p>
              ) : null}
              {preview?.branchAddress ? <p>{preview.branchAddress}</p> : null}
              <p>
                <span className="font-semibold">{t('crm.fullName')}:</span>{' '}
                {preview?.customerName ?? selected.fullName}
              </p>
              <p>
                <span className="font-semibold">{t('customers.customerType')}:</span>{' '}
                {preview?.customerTypeLabel ?? selected.customerTypeLabel}
              </p>
              {preview ? (
                <>
                  <p>
                    <span className="font-semibold">{t('crm.priceListTitle')}:</span>{' '}
                    {preview.title}
                  </p>
                  <p>
                    <span className="font-semibold">{t('crm.priceListGeneratedAt')}:</span>{' '}
                    {new Date(preview.generatedAt).toLocaleString('ru-RU')}
                  </p>
                  {preview.validityNote ? (
                    <p className="mt-2 whitespace-pre-line text-slate-600">{preview.validityNote}</p>
                  ) : null}
                </>
              ) : null}
            </div>

            {preview ? (
              <div className="max-h-72 overflow-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-16 px-3 py-2">{t('inventory.photo')}</th>
                      <th className="px-3 py-2">{t('inventory.name')}</th>
                      <th className="w-28 px-3 py-2">{t('inventory.unit')}</th>
                      <th className="w-32 px-3 py-2 text-right">{t('crm.priceListPrice')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.products.slice(0, 50).map((product) => (
                      <tr key={product.productId}>
                        <td className="w-16 px-3 py-2 text-slate-400">
                          {product.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.photoUrl}
                              alt=""
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900 break-words">
                          {product.name}
                        </td>
                        <td className="w-28 px-3 py-2 text-slate-600">{product.unit ?? '—'}</td>
                        <td className="w-32 px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {product.finalPriceKgs.toLocaleString('ru-RU')} {product.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!initialCustomerId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setPreview(null);
                    setGenerated(null);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('crm.priceListChangeCustomer')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={loading || !preview}
                onClick={() => void downloadPdf()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {t('crm.priceListDownloadPdf')}
              </button>
              <button
                type="button"
                disabled={loading || !preview}
                onClick={() => void sendWhatsApp()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {t('crm.priceListSendWhatsApp')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
            </div>
            {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
