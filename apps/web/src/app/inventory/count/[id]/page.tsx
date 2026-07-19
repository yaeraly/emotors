'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { WarehouseTopNav } from '@/components/WarehouseTopNav';
import { apiFetch } from '@/lib/api';
import { canApproveInventoryCountForWarehouse, canDeleteInventoryCount, canManageInventoryCountForWarehouse, isBranchOwnerUser, isBranchWarehouseOperator } from '@/lib/rbac';
import type { InventoryCountItem, InventoryCountSession, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { inventoryTypeLabel } from '@/lib/inventory-count';
import { BRANCH_CEO_WAREHOUSE_INVENTORY_BASE } from '@/lib/branch-ceo-warehouse';
import { BRANCH_WAREHOUSE_INVENTORY_BASE } from '@/lib/branch-warehouse-inventory';
import { BranchWarehouseSection } from '@/components/branch-warehouse/BranchWarehouseSection';
import { usePathname } from 'next/navigation';

type SearchResult = {
  productId: string;
  sku: string;
  barcode?: string | null;
  productName: string;
  categoryName: string;
  shelf?: string | null;
  zone?: string | null;
  systemQuantity: number;
  unitCostKgs: number;
};

export default function InventoryCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const [session, setSession] = useState<InventoryCountSession | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [pendingQty, setPendingQty] = useState<Record<string, string>>({});
  const [unexpectedCandidate, setUnexpectedCandidate] = useState<SearchResult | null>(null);
  const [addingUnexpected, setAddingUnexpected] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const canManage = canManageInventoryCountForWarehouse(currentUser, session?.warehouseId);
  const canApprove = canApproveInventoryCountForWarehouse(currentUser, session?.warehouse ?? null);
  const canDelete = canDeleteInventoryCount(currentUser);
  const branchScopedView =
    currentUser &&
    (isBranchWarehouseOperator(currentUser) || isBranchOwnerUser(currentUser));
  const hideFinancials = Boolean(currentUser && isBranchWarehouseOperator(currentUser));
  const inventoryListHref = isBranchWarehouseOperator(currentUser)
    ? BRANCH_WAREHOUSE_INVENTORY_BASE
    : isBranchOwnerUser(currentUser)
      ? BRANCH_CEO_WAREHOUSE_INVENTORY_BASE
      : branchScopedView
        ? '/inventory/count'
        : '/hq-warehouses?tab=inventory';
  const inventoryDetailBase = pathname.startsWith(BRANCH_WAREHOUSE_INVENTORY_BASE)
    ? BRANCH_WAREHOUSE_INVENTORY_BASE
    : pathname.startsWith(BRANCH_CEO_WAREHOUSE_INVENTORY_BASE)
      ? BRANCH_CEO_WAREHOUSE_INVENTORY_BASE
      : '/inventory/count';
  const branchInventoryFlow =
    pathname.startsWith(BRANCH_WAREHOUSE_INVENTORY_BASE) ||
    pathname.startsWith(BRANCH_CEO_WAREHOUSE_INVENTORY_BASE);

  async function confirmDelete(reason?: string) {
    if (!session) return;
    setDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/inventory-count/sessions/${session.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setDeleteModalOpen(false);
      if (result.archived) {
        setSuccess(t('inventoryCount.archivedSuccess'));
        await load();
      } else {
        router.replace(inventoryDetailBase);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('reason is required')) {
        setDeleteRequireReason(true);
      }
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function load() {
    const [result, me] = await Promise.all([
      apiFetch<InventoryCountSession>(`/inventory-count/sessions/${id}`),
      apiFetch<User>('/auth/me'),
    ]);
    setSession(result);
    setCurrentUser(me);
    setPendingQty(
      Object.fromEntries(
        (result.items ?? []).map((item) => [
          item.id,
          item.actualQuantity !== null ? String(item.actualQuantity) : '',
        ]),
      ),
    );
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !session?.items) return session?.items ?? [];
    return session.items.filter(
      (item) =>
        item.sku.toLowerCase().includes(term) ||
        item.productName.toLowerCase().includes(term) ||
        (item.product?.barcode?.toLowerCase().includes(term) ?? false),
    );
  }, [session?.items, search]);

  function scrollToItem(itemId: string) {
    setHighlightItemId(itemId);
    document.getElementById(`item-row-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    barcodeRef.current?.focus();
  }

  function findSessionItem(term: string) {
    const normalized = term.trim().toLowerCase();
    if (!normalized || !session?.items) return null;

    const exactBarcode = session.items.find(
      (item) => item.product?.barcode?.toLowerCase() === normalized,
    );
    if (exactBarcode) return exactBarcode;

    const exactSku = session.items.find((item) => item.sku.toLowerCase() === normalized);
    if (exactSku) return exactSku;

    return (
      session.items.find((item) => item.productName.toLowerCase().includes(normalized)) ?? null
    );
  }

  async function startCounting() {
    setError('');
    try {
      setSession(await apiFetch<InventoryCountSession>(`/inventory-count/sessions/${id}/start`, { method: 'POST' }));
      setSuccess(t('inventoryCount.started'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveItem(item: InventoryCountItem) {
    if (!session || session.status !== 'COUNTING' || !canManage) return;
    const actualQuantity = Number(pendingQty[item.id] ?? '');
    if (Number.isNaN(actualQuantity) || actualQuantity < 0) return;

    setError('');
    try {
      await apiFetch(`/inventory-count/sessions/${id}/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ actualQuantity }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submitInventory() {
    setError('');
    try {
      setSession(await apiFetch<InventoryCountSession>(`/inventory-count/sessions/${id}/submit`, { method: 'POST' }));
      setSuccess(t('inventoryCount.submitted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function approveInventory() {
    setError('');
    try {
      setSession(await apiFetch<InventoryCountSession>(`/inventory-count/sessions/${id}/approve`, { method: 'POST' }));
      setSuccess(t('inventoryCount.approved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function rejectInventory(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      setSession(
        await apiFetch<InventoryCountSession>(`/inventory-count/sessions/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }),
      );
      setSuccess(t('inventoryCount.rejected'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addUnexpectedProduct() {
    if (!session || !unexpectedCandidate || !canManage) return;
    setAddingUnexpected(true);
    setError('');
    try {
      await apiFetch(`/inventory-count/sessions/${id}/items`, {
        method: 'POST',
        body: JSON.stringify({ productId: unexpectedCandidate.productId }),
      });
      setUnexpectedCandidate(null);
      setSearch('');
      setSuccess(t('inventoryCount.unexpectedProductAdded'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAddingUnexpected(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const term = search.trim();
    if (!term) return;

    setError('');
    setUnexpectedCandidate(null);
    const localMatch = findSessionItem(term);
    if (localMatch) {
      scrollToItem(localMatch.id);
      return;
    }

    if (session.status !== 'COUNTING') {
      setError(t('inventoryCount.noSearchResults'));
      return;
    }

    try {
      const results = await apiFetch<SearchResult[]>(
        `/inventory-count/search?warehouseId=${session.warehouseId}&q=${encodeURIComponent(term)}`,
      );
      if (results.length === 0) {
        setError(t('inventoryCount.noSearchResults'));
        return;
      }
      const match = results.find((row) =>
        session.items?.some((item) => item.productId === row.productId),
      );
      if (!match) {
        if (canManage) {
          setUnexpectedCandidate(results[0]);
        } else {
          setError(t('inventoryCount.productNotInSession'));
        }
        return;
      }
      const item = session.items?.find((entry) => entry.productId === match.productId);
      if (item) {
        scrollToItem(item.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!session) {
    return (
      <ProtectedShell>
        <p className="text-slate-500">{t('common.loading')}</p>
      </ProtectedShell>
    );
  }

  const summary = session.summary;
  const isCounting = session.status === 'COUNTING';
  const isDraft = session.status === 'DRAFT';
  const isSubmitted = session.status === 'SUBMITTED';

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {branchInventoryFlow ? <BranchWarehouseSection activeTab="inventory" showHeading={false} /> : null}
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <Link href={inventoryListHref} className="text-sm font-semibold text-blue-600">
              ← {t('inventoryCount.title')}
            </Link>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{session.sessionNumber}</h2>
            <p className="mt-2 text-slate-500">
              {session.warehouse?.name} · {inventoryTypeLabel(session.inventoryType, t)} ·{' '}
              {t(`inventoryCount.status.${session.status}`)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDraft && canManage ? (
              <button
                type="button"
                onClick={() => void startCounting()}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
              >
                {t('inventoryCount.startCounting')}
              </button>
            ) : null}
            {isCounting && canManage ? (
              <button
                type="button"
                onClick={() => void submitInventory()}
                className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"
              >
                {isBranchWarehouseOperator(currentUser)
                  ? t('inventoryCount.submitToBranchCeo')
                  : t('inventoryCount.submit')}
              </button>
            ) : null}
            {isSubmitted && canApprove ? (
              <>
                <button
                  type="button"
                  onClick={() => void approveInventory()}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"
                >
                  {t('inventoryCount.approve')}
                </button>
              </>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteRequireReason(!['DRAFT', 'COUNTING'].includes(session.status));
                  setDeleteModalOpen(true);
                }}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 font-semibold text-red-700"
              >
                {t('common.delete')}
              </button>
            ) : null}
          </div>
        </div>

        {isCounting && canManage && isBranchWarehouseOperator(currentUser) ? (
          <p className="text-sm text-slate-500">{t('inventoryCount.submitToBranchCeoHint')}</p>
        ) : null}

        <DeleteConfirmModal
          open={deleteModalOpen}
          title={t('common.deleteConfirmTitle')}
          message={t('common.deleteConfirmMessage')}
          requireReason={deleteRequireReason}
          loading={deleting}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={confirmDelete}
        />

        {!branchScopedView ? <WarehouseTopNav /> : null}

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

        {summary ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <SummaryCard label={t('inventoryCount.totalProducts')} value={String(summary.totalProducts)} />
            <SummaryCard label={t('inventoryCount.countedProducts')} value={String(summary.countedProducts)} />
            <SummaryCard label={t('inventoryCount.remainingProducts')} value={String(summary.remainingProducts)} />
            <SummaryCard label={t('inventoryCount.shortages')} value={String(summary.shortages)} tone="red" />
            <SummaryCard label={t('inventoryCount.overages')} value={String(summary.overages)} tone="amber" />
            {!hideFinancials ? (
              <SummaryCard
                label={t('inventoryCount.totalDifferenceValue')}
                value={formatKgs(summary.totalDifferenceValueKgs)}
              />
            ) : null}
          </div>
        ) : null}

        {isSubmitted && canApprove ? (
          <form onSubmit={rejectInventory} className="flex flex-col gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="text-sm font-semibold text-red-800">{t('inventoryCount.rejectReason')}</span>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-2 w-full rounded-xl border border-red-200 px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded-xl bg-red-600 px-4 py-3 font-semibold text-white">
              {t('inventoryCount.reject')}
            </button>
          </form>
        ) : null}

        {session.rejectionReason ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t('inventoryCount.rejectionReason')}: {session.rejectionReason}
          </p>
        ) : null}

        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            ref={barcodeRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setError('');
              setUnexpectedCandidate(null);
            }}
            placeholder={t('inventoryCount.searchPlaceholder')}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
          />
          <button type="submit" className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">
            {t('common.search')}
          </button>
        </form>

        {unexpectedCandidate && isCounting && canManage ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-900">{t('inventoryCount.unexpectedProductHint')}</p>
              <p className="mt-1 text-sm text-amber-800">
                {unexpectedCandidate.sku} · {unexpectedCandidate.productName} ·{' '}
                {t('inventoryCount.systemQuantity')}: {unexpectedCandidate.systemQuantity}
              </p>
            </div>
            <button
              type="button"
              disabled={addingUnexpected}
              onClick={() => void addUnexpectedProduct()}
              className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {t('inventoryCount.addUnexpectedProduct')}
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('inventory.name')}</th>
                <th className="px-4 py-3">{t('inventory.sku')}</th>
                <th className="px-4 py-3">{t('inventory.category')}</th>
                <th className="px-4 py-3">{t('inventoryCount.shelf')}</th>
                <th className="px-4 py-3">{t('inventoryCount.zone')}</th>
                <th className="px-4 py-3">{t('inventoryCount.systemQuantity')}</th>
                <th className="px-4 py-3">{t('inventoryCount.actualQuantity')}</th>
                <th className="px-4 py-3">{t('inventoryCount.difference')}</th>
                {!hideFinancials ? (
                  <th className="px-4 py-3">{t('inventoryCount.differenceValue')}</th>
                ) : null}
                {isCounting && canManage ? <th className="px-4 py-3">{t('common.actions')}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  id={`item-row-${item.id}`}
                  className={rowClass(item, highlightItemId === item.id)}
                >
                  <td className="px-4 py-3 font-medium">{item.productName}</td>
                  <td className="px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3">{item.categoryName}</td>
                  <td className="px-4 py-3">{item.shelf ?? '—'}</td>
                  <td className="px-4 py-3">{item.zone ?? '—'}</td>
                  <td className="px-4 py-3">{item.systemQuantity}</td>
                  <td className="px-4 py-3">
                    {isCounting && canManage ? (
                      <input
                        type="number"
                        min="0"
                        value={pendingQty[item.id] ?? ''}
                        onChange={(e) =>
                          setPendingQty((current) => ({ ...current, [item.id]: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                      />
                    ) : (
                      (item.actualQuantity ?? '—')
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DifferenceBadge item={item} t={t} />
                  </td>
                  {!hideFinancials ? (
                    <td className="px-4 py-3">{formatKgs(item.differenceValueKgs)}</td>
                  ) : null}
                  {isCounting && canManage ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void saveItem(item)}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold"
                      >
                        {t('common.save')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'amber';
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-100 bg-red-50'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function DifferenceBadge({ item, t }: { item: InventoryCountItem; t: (key: string) => string }) {
  if (item.actualQuantity === null) return <span className="text-slate-400">—</span>;
  if (item.differenceQuantity < 0) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
        {t('inventoryCount.shortage')} ({item.differenceQuantity})
      </span>
    );
  }
  if (item.differenceQuantity > 0) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
        {t('inventoryCount.overage')} (+{item.differenceQuantity})
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
      {t('inventoryCount.matched')}
    </span>
  );
}

function rowClass(item: InventoryCountItem, highlighted: boolean) {
  if (highlighted) return 'bg-blue-50 ring-2 ring-blue-300';
  if (item.actualQuantity === null) return '';
  if (item.differenceQuantity < 0) return 'bg-red-50/60';
  if (item.differenceQuantity > 0) return 'bg-amber-50/60';
  return '';
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} сом`;
}
