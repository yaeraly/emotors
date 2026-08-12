'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  computeBranchHqReturnDifferenceQuantity,
  sortBranchHqReturnItemsForPickingDisplay,
} from '@/lib/branch-hq-return-display.util';
import { formatKgs } from '@/lib/money';
import {
  hasFullAccess,
  hasRole,
  isBranchOwnerUser,
  isBranchSalesManagerUser,
  isBranchWarehouseOperator,
  isHqAccountantUser,
  isWarehouseManagerUser,
} from '@/lib/rbac';
import { toast } from '@/lib/toast';
import type {
  BranchHqReturn,
  BranchHqReturnCondition,
  BranchHqReturnItem,
  User,
} from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ReceiveDraft = {
  itemId: string;
  receivedQuantity: string;
  damagedQuantity: string;
  condition: BranchHqReturnCondition;
  note: string;
};

const CONDITIONS: BranchHqReturnCondition[] = ['NEW', 'USED', 'DEFECTIVE', 'DAMAGED'];

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value || '-'}</p>
    </div>
  );
}

export default function BranchHqReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [row, setRow] = useState<BranchHqReturn | null>(null);
  const [error, setError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [financeNote, setFinanceNote] = useState('');
  const [receiveDrafts, setReceiveDrafts] = useState<ReceiveDraft[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [me, result] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<BranchHqReturn>(`/branch-hq-returns/${id}`),
      ]);
      setUser(me);
      setRow(result);
      setReceiveDrafts(
        (result.items ?? []).map((item) => ({
          itemId: item.id,
          receivedQuantity: String(item.shippedQuantity || item.quantity || 0),
          damagedQuantity: String(item.damagedQuantity || 0),
          condition: item.hqCondition || item.condition || 'NEW',
          note: item.hqReceivingNote || '',
        })),
      );
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
      toast.error(message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const branchWh = isBranchWarehouseOperator(user);
  const branchApprover =
    isBranchSalesManagerUser(user) ||
    isBranchOwnerUser(user) ||
    Boolean(user && hasRole(user, 'MANAGER'));
  const hqWarehouse = isWarehouseManagerUser(user) || hasFullAccess(user) || Boolean(user && hasRole(user, 'CEO'));
  const hqFinance =
    isHqAccountantUser(user) ||
    Boolean(user && hasRole(user, 'FINANCE_MANAGER')) ||
    hasFullAccess(user);
  const showManagerCosts = branchApprover || hqFinance || hasFullAccess(user);

  const pickingProgress = row?.pickingProgress ?? {
    pickedCount: 0,
    totalCount: 0,
    remainingCount: 0,
  };
  const showPicking =
    Boolean(branchWh || hasFullAccess(user)) &&
    Boolean(row && ['BRANCH_APPROVED', 'READY_TO_SHIP', 'PICKING', 'PACKED'].includes(row.status));
  const showPickedColumn = showPicking || Boolean(row && ['PICKING', 'PACKED', 'SHIPPED_TO_HQ'].includes(row.status));

  const displayItems = useMemo(() => {
    const items = row?.items ?? [];
    if (!showPickedColumn) return items;
    return sortBranchHqReturnItemsForPickingDisplay(items);
  }, [row?.items, showPickedColumn]);

  async function postAction(
    path: string,
    successKey: string,
    body?: Record<string, unknown>,
  ) {
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<BranchHqReturn>(`/branch-hq-returns/${id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setRow(updated);
      toast.success(t(successKey));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function setItemPicked(itemId: string, picked: boolean) {
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<BranchHqReturn>(
        `/branch-hq-returns/${id}/items/${itemId}/picked`,
        {
          method: 'PATCH',
          body: JSON.stringify({ picked }),
        },
      );
      setRow(updated);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      toast.success(
        picked ? t('branchHqReturn.toast.itemPicked') : t('branchHqReturn.toast.itemUnpicked'),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReceive() {
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<BranchHqReturn>(`/branch-hq-returns/${id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          items: receiveDrafts.map((draft) => ({
            itemId: draft.itemId,
            receivedQuantity: Number(draft.receivedQuantity || 0),
            damagedQuantity: Number(draft.damagedQuantity || 0),
            condition: draft.condition,
            note: draft.note.trim() || undefined,
          })),
        }),
      });
      setRow(updated);
      toast.success(t('branchHqReturn.toast.received'));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function updateReceiveDraft(itemId: string, patch: Partial<ReceiveDraft>) {
    setReceiveDrafts((current) =>
      current.map((draft) => (draft.itemId === itemId ? { ...draft, ...patch } : draft)),
    );
  }

  function sentQty(item: BranchHqReturnItem) {
    return Number(item.shippedQuantity || item.quantity || 0);
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('branchHqReturn.detailTitle')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{row?.returnNumber ?? '-'}</h2>
          </div>
          <Link
            href="/branch-hq-returns"
            className="inline-flex h-fit items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('common.back')}
          </Link>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {row ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
                <Info label={t('branchHqReturn.status')} value={t(`branchHqReturn.status.${row.status}`)} />
                <Info label={t('distribution.branch')} value={row.branch?.name ?? ''} />
                <Info label={t('branchHqReturn.quantity')} value={String(row.totalQuantity)} />
                <Info label={t('branchHqReturn.returnSum')} value={formatKgs(row.totalReturnValueKgs)} />
                <Info label={t('branchHqReturn.date')} value={new Date(row.createdAt).toLocaleString()} />
                {row.rejectionReason ? (
                  <Info label={t('branchHqReturn.rejectReason')} value={row.rejectionReason} />
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {row.status === 'DRAFT' && (branchWh || hasFullAccess(user)) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('submit', 'branchHqReturn.toast.submitted')}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {t('branchHqReturn.submit')}
                  </button>
                ) : null}

                {row.status === 'PENDING_BRANCH_APPROVAL' && branchApprover ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void postAction('approve', 'branchHqReturn.toast.approved')}
                      className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                    >
                      {t('branchHqReturn.approve')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void postAction('reject', 'branchHqReturn.toast.rejected', {
                          reason: rejectReason.trim() || undefined,
                        })
                      }
                      className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                    >
                      {t('branchHqReturn.reject')}
                    </button>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder={t('branchHqReturn.rejectReason')}
                      className="min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </>
                ) : null}

                {(row.status === 'BRANCH_APPROVED' || row.status === 'READY_TO_SHIP') &&
                (branchWh || hasFullAccess(user)) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('pick', 'branchHqReturn.toast.pickingStarted')}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {t('branchHqReturn.startPicking')}
                  </button>
                ) : null}

                {row.status === 'PICKING' && (branchWh || hasFullAccess(user)) ? (
                  <button
                    type="button"
                    disabled={busy || pickingProgress.remainingCount > 0}
                    onClick={() => void postAction('pack', 'branchHqReturn.toast.packed')}
                    className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {t('branchHqReturn.pack')}
                  </button>
                ) : null}

                {(row.status === 'PACKED' ||
                  row.status === 'PICKING' ||
                  row.status === 'READY_TO_SHIP' ||
                  row.status === 'BRANCH_APPROVED') &&
                (branchWh || hasFullAccess(user)) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('ship', 'branchHqReturn.toast.shipped')}
                    className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {t('branchHqReturn.ship')}
                  </button>
                ) : null}

                {['DRAFT', 'PENDING_BRANCH_APPROVAL', 'BRANCH_APPROVED', 'READY_TO_SHIP', 'PICKING', 'PACKED'].includes(
                  row.status,
                ) &&
                (branchWh || branchApprover || hasFullAccess(user)) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('cancel', 'branchHqReturn.toast.cancelled')}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {t('branchHqReturn.cancel')}
                  </button>
                ) : null}
              </div>

              {row.status === 'PICKING' ? (
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  {t('branchHqReturn.pickingProgress')
                    .replace('{picked}', String(pickingProgress.pickedCount))
                    .replace('{total}', String(pickingProgress.totalCount))}
                </p>
              ) : null}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('branchHqReturn.product')}</th>
                      <th className="px-4 py-3">{t('branchHqReturn.quantity')}</th>
                      <th className="px-4 py-3">{t('branchHqReturn.reason')}</th>
                      <th className="px-4 py-3">{t('branchHqReturn.condition')}</th>
                      {showManagerCosts ? (
                        <>
                          <th className="px-4 py-3">{t('branchHqReturn.unitCost')}</th>
                          <th className="px-4 py-3">{t('branchHqReturn.lineSum')}</th>
                        </>
                      ) : null}
                      {showPickedColumn ? (
                        <th className="px-4 py-3">{t('branchHqReturn.picked')}</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayItems.map((item) => {
                      const isPicked = Boolean(item.pickedAt);
                      const canPickItem =
                        (branchWh || hasFullAccess(user)) &&
                        row.status === 'PICKING' &&
                        Number(item.quantity) > 0;
                      return (
                        <tr key={item.id} className={isPicked ? 'bg-green-50' : undefined}>
                          <td className="px-4 py-3">{item.sku}</td>
                          <td className="px-4 py-3">{item.productName}</td>
                          <td className="px-4 py-3">{item.quantity}</td>
                          <td className="px-4 py-3">{t(`branchHqReturn.reason.${item.reason}`)}</td>
                          <td className="px-4 py-3">{t(`branchHqReturn.condition.${item.condition}`)}</td>
                          {showManagerCosts ? (
                            <>
                              <td className="px-4 py-3">{formatKgs(item.unitCostKgs)}</td>
                              <td className="px-4 py-3">{formatKgs(item.lineReturnValueKgs)}</td>
                            </>
                          ) : null}
                          {showPickedColumn ? (
                            <td className="px-4 py-3">
                              {canPickItem && !isPicked ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                                  onClick={() => void setItemPicked(item.id, true)}
                                >
                                  {t('branchHqReturn.markPicked')}
                                </button>
                              ) : null}
                              {isPicked ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
                                    {t('branchHqReturn.picked')}
                                  </span>
                                  {canPickItem ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                      onClick={() => void setItemPicked(item.id, false)}
                                    >
                                      {t('branchHqReturn.undoPick')}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {hqWarehouse &&
            row &&
            ['SHIPPED_TO_HQ', 'DISCREPANCY', 'RECEIVED_AT_HQ'].includes(row.status) ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">{t('branchHqReturn.receive')}</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{t('branchHqReturn.product')}</th>
                        <th className="px-3 py-2">{t('branchHqReturn.sentQty')}</th>
                        <th className="px-3 py-2">{t('branchHqReturn.receivedQty')}</th>
                        <th className="px-3 py-2">{t('branchHqReturn.damagedQty')}</th>
                        <th className="px-3 py-2">{t('branchHqReturn.differenceQty')}</th>
                        <th className="px-3 py-2">{t('branchHqReturn.hqCondition')}</th>
                        <th className="px-3 py-2">{t('branchHqReturn.hqNotes')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(row.items ?? []).map((item) => {
                        const draft = receiveDrafts.find((entry) => entry.itemId === item.id);
                        const received = Number(draft?.receivedQuantity || 0);
                        const difference = computeBranchHqReturnDifferenceQuantity(
                          sentQty(item),
                          received,
                        );
                        return (
                          <tr key={item.id}>
                            <td className="px-3 py-2">
                              <div className="font-semibold">{item.productName}</div>
                              <div className="text-xs text-slate-500">{item.sku}</div>
                            </td>
                            <td className="px-3 py-2">{sentQty(item)}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                value={draft?.receivedQuantity ?? '0'}
                                onChange={(event) =>
                                  updateReceiveDraft(item.id, {
                                    receivedQuantity: event.target.value,
                                  })
                                }
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                value={draft?.damagedQuantity ?? '0'}
                                onChange={(event) =>
                                  updateReceiveDraft(item.id, {
                                    damagedQuantity: event.target.value,
                                  })
                                }
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2 font-semibold">{difference}</td>
                            <td className="px-3 py-2">
                              <select
                                value={draft?.condition ?? 'NEW'}
                                onChange={(event) =>
                                  updateReceiveDraft(item.id, {
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
                                value={draft?.note ?? ''}
                                onChange={(event) =>
                                  updateReceiveDraft(item.id, { note: event.target.value })
                                }
                                className="min-w-[140px] rounded-lg border border-slate-300 px-2 py-1"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitReceive()}
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {t('branchHqReturn.accept')}
                </button>
              </section>
            ) : null}

            {row.financialAdjustment &&
            (hqFinance || branchApprover || hasFullAccess(user)) ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">{t('branchHqReturn.financePanel')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Info
                    label={t('branchHqReturn.financeStatus')}
                    value={t(`branchHqReturn.financeStatus.${row.financialAdjustment.status}`)}
                  />
                  <Info
                    label={t('branchHqReturn.acceptedValue')}
                    value={formatKgs(row.financialAdjustment.acceptedReturnValueKgs)}
                  />
                  <Info
                    label={t('branchHqReturn.currentDebt')}
                    value={formatKgs(row.financialAdjustment.currentDebtKgs)}
                  />
                  <Info
                    label={t('branchHqReturn.suggestedCredit')}
                    value={formatKgs(row.financialAdjustment.suggestedCreditKgs)}
                  />
                  <Info
                    label={t('branchHqReturn.appliedCredit')}
                    value={formatKgs(row.financialAdjustment.appliedCreditKgs)}
                  />
                  <Info
                    label={t('branchHqReturn.resultingDebt')}
                    value={formatKgs(row.financialAdjustment.resultingDebtKgs)}
                  />
                  <Info
                    label={t('branchHqReturn.remainingCredit')}
                    value={formatKgs(row.financialAdjustment.remainingCreditKgs)}
                  />
                </div>

                {hqFinance && row.financialAdjustment.status === 'PENDING' ? (
                  <div className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={financeNote}
                      onChange={(event) => setFinanceNote(event.target.value)}
                      placeholder={t('branchHqReturn.financeNote')}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void postAction('finance-decision', 'branchHqReturn.toast.financeApproved', {
                            approve: true,
                            note: financeNote.trim() || undefined,
                          })
                        }
                        className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                      >
                        {t('branchHqReturn.approveFinance')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void postAction('finance-decision', 'branchHqReturn.toast.financeRejected', {
                            approve: false,
                            note: financeNote.trim() || undefined,
                          })
                        }
                        className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                      >
                        {t('branchHqReturn.rejectFinance')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
