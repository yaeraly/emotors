'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchWarehouseStockProductCombobox } from '@/components/BranchWarehouseStockProductCombobox';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  BranchHqReturn,
  BranchHqReturnCondition,
  BranchHqReturnReason,
  User,
} from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type StockRow = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  availableQuantity: number;
  quantityOnHand: number;
};

type StockResponse = {
  warehouse: { id: string; name: string; code: string };
  items: StockRow[];
};

type DraftLine = {
  key: string;
  productId: string;
  productName: string;
  sku: string;
  available: number;
  quantity: string;
  reason: BranchHqReturnReason;
  condition: BranchHqReturnCondition;
  comment: string;
};

const REASONS: BranchHqReturnReason[] = [
  'SURPLUS',
  'ORDER_ERROR',
  'DEFECT',
  'MALFUNCTION',
  'EXCHANGE',
  'HQ_DECISION',
  'OTHER',
];

const CONDITIONS: BranchHqReturnCondition[] = ['NEW', 'USED', 'DEFECTIVE', 'DAMAGED'];

export default function NewBranchHqReturnPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingStock, setLoadingStock] = useState(true);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setLoadingStock(true);
    void apiFetch<StockResponse>('/branch-warehouse/stock')
      .then((result) => {
        setStock(
          (result.items ?? []).filter(
            (item) => Number(item.availableQuantity ?? item.quantityOnHand ?? 0) > 0,
          ),
        );
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => setLoadingStock(false));
  }, [t]);

  const stockOptions = useMemo(
    () =>
      stock.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        productCode: row.productCode,
        availableQuantity: Number(row.availableQuantity ?? row.quantityOnHand ?? 0),
      })),
    [stock],
  );

  const addedProductIds = useMemo(() => lines.map((line) => line.productId), [lines]);

  function addLine() {
    setError('');
    const product = stock.find((row) => row.productId === selectedProductId);
    if (!product) {
      setError(t('branchHqReturn.selectProduct'));
      return;
    }
    if (lines.some((line) => line.productId === product.productId)) {
      return;
    }
    setLines((current) => [
      ...current,
      {
        key: `${product.productId}-${Date.now()}`,
        productId: product.productId,
        productName: product.productName,
        sku: product.productCode,
        available: Number(product.availableQuantity ?? product.quantityOnHand ?? 0),
        quantity: '1',
        reason: 'SURPLUS',
        condition: 'NEW',
        comment: '',
      },
    ]);
    setSelectedProductId('');
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (lines.length === 0) {
      setError(t('branchHqReturn.itemsRequired'));
      return;
    }
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty < 1 || qty > line.available) {
        setError(t('branchHqReturn.qtyExceedsAvailable'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<BranchHqReturn>('/branch-hq-returns', {
        method: 'POST',
        body: JSON.stringify({
          note: note.trim() || undefined,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            reason: line.reason,
            condition: line.condition,
            comment: line.comment.trim() || undefined,
          })),
        }),
      });
      toast.success(t('branchHqReturn.toast.created'));
      router.push(`/branch-hq-returns/${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('branchHqReturn.title')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('branchHqReturn.newTitle')}</h2>
            {user?.branchId ? (
              <p className="mt-1 text-sm text-slate-600">{user.fullName}</p>
            ) : null}
          </div>
          <Link
            href="/branch-hq-returns"
            className="inline-flex h-fit items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('common.back')}
          </Link>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <BranchWarehouseStockProductCombobox
                label={t('branchHqReturn.product')}
                value={selectedProductId}
                options={stockOptions}
                excludedProductIds={addedProductIds}
                loading={loadingStock}
                onChange={setSelectedProductId}
              />
              <button
                type="button"
                onClick={addLine}
                disabled={loadingStock || !selectedProductId}
                className="h-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('branchHqReturn.addItem')}
              </button>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('branchHqReturn.product')}</th>
                    <th className="px-3 py-2">{t('branchHqReturn.onHand')}</th>
                    <th className="px-3 py-2">{t('branchHqReturn.returnQty')}</th>
                    <th className="px-3 py-2">{t('branchHqReturn.reason')}</th>
                    <th className="px-3 py-2">{t('branchHqReturn.condition')}</th>
                    <th className="px-3 py-2">{t('branchHqReturn.comment')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-slate-500">
                        {t('branchHqReturn.itemsRequired')}
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.key}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{line.productName}</div>
                          <div className="text-xs text-slate-500">{line.sku}</div>
                        </td>
                        <td className="px-3 py-2">{line.available}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            max={line.available}
                            value={line.quantity}
                            onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.reason}
                            onChange={(event) =>
                              updateLine(line.key, { reason: event.target.value as BranchHqReturnReason })
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1"
                          >
                            {REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {t(`branchHqReturn.reason.${reason}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.condition}
                            onChange={(event) =>
                              updateLine(line.key, {
                                condition: event.target.value as BranchHqReturnCondition,
                              })
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1"
                          >
                            {CONDITIONS.map((condition) => (
                              <option key={condition} value={condition}>
                                {t(`branchHqReturn.condition.${condition}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.comment}
                            onChange={(event) => updateLine(line.key, { comment: event.target.value })}
                            className="w-full min-w-[140px] rounded-lg border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                          >
                            {t('branchHqReturn.removeItem')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <label className="mt-6 block text-sm font-semibold text-slate-700">
              {t('branchHqReturn.note')}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                rows={3}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? t('common.saving') : t('branchHqReturn.create')}
          </button>
        </form>
      </section>
    </ProtectedShell>
  );
}
