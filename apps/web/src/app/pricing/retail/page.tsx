'use client';

import { useEffect, useMemo, useState } from 'react';
import { MaximumMarkupOverrideModal } from '@/components/pricing/MaximumMarkupOverrideModal';
import { PreviewPriceCell } from '@/components/pricing/PreviewPriceCell';
import {
  MarkupTableHeaders,
  MaximumMarkupSourceDot,
  RowActionsMenu,
  formatCompactDate,
  formatCompactMoney,
  formatCompactPercent,
  markupTable,
} from '@/components/pricing/pricing-markup-table-ui';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { usePricingMarkupPreview } from '@/hooks/use-pricing-markup-preview';
import { apiFetch } from '@/lib/api';
import { createMarkupRowEditorState } from '@/lib/pricing-markup-preview';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type RetailRow = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  effectiveBranchPriceKgs: number;
  minimumRetailMarkupPercent: number;
  minimumRetailPriceKgs: number;
  recommendedRetailMarkupPercent: number;
  recommendedRetailPriceKgs: number;
  inheritedMaximumRetailMarkupPercent: number;
  maximumRetailMarkupOverridePercent: number | null;
  effectiveMaximumRetailMarkupPercent: number;
  maximumRetailPriceKgs: number;
  maximumRetailMarkupSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  validationStatus: 'OK' | 'ERROR';
  validationErrors: string[];
  lastUpdated: string | null;
};

type EditableRetailRow = RetailRow & ReturnType<typeof createMarkupRowEditorState>;

function toEditableRow(product: RetailRow): EditableRetailRow {
  return {
    ...product,
    ...createMarkupRowEditorState(product, 'retail'),
  };
}

export default function PricingRetailPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableRetailRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [overrideRow, setOverrideRow] = useState<RetailRow | null>(null);

  const canManage = canManagePricingPolicy(user);
  const { schedulePreview, cancelRowEdits } = usePricingMarkupPreview('retail', setRows);

  async function load() {
    const [products, me] = await Promise.all([
      apiFetch<RetailRow[]>('/pricing/retail'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(products.map(toEditableRow));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query),
    );
  }, [rows, search]);

  function requestPreview(row: EditableRetailRow) {
    schedulePreview(row.id, {
      minimumSellingMarkupPercent: row.draftMinMarkup,
      recommendedRetailMarkupPercent: row.draftRecommendedMarkup,
      maximumRetailMarkupOverridePercent: row.maximumRetailMarkupOverridePercent,
    });
  }

  function updateMinMarkup(productId: string, value: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const next = {
          ...row,
          draftMinMarkup: value,
          isDirty:
            Math.abs(value - row.savedMinMarkup) > 0.001 ||
            Math.abs(row.draftRecommendedMarkup - row.savedRecMarkup) > 0.001,
        };
        requestPreview(next);
        return next;
      }),
    );
  }

  function updateRecommendedMarkup(productId: string, value: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const next = {
          ...row,
          draftRecommendedMarkup: value,
          isDirty:
            Math.abs(row.draftMinMarkup - row.savedMinMarkup) > 0.001 ||
            Math.abs(value - row.savedRecMarkup) > 0.001,
        };
        requestPreview(next);
        return next;
      }),
    );
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;
    if (row.previewValid === false) {
      setError(row.previewValidationErrors[0] ?? t('common.error'));
      return;
    }

    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      const saved = await apiFetch<RetailRow>(`/pricing/retail/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          minimumSellingMarkupPercent: row.draftMinMarkup,
          recommendedRetailMarkupPercent: row.draftRecommendedMarkup,
        }),
      });
      setRows((current) =>
        current.map((item) => (item.id === productId ? toEditableRow({ ...item, ...saved }) : item)),
      );
      setSuccess(t('pricing.productSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  async function restoreInheritance(productId: string) {
    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      const saved = await apiFetch<RetailRow>(`/pricing/retail/${productId}/maximum-markup-override`, {
        method: 'DELETE',
      });
      setRows((current) =>
        current.map((item) => (item.id === productId ? toEditableRow({ ...item, ...saved }) : item)),
      );
      setSuccess(t('pricing.inheritanceRestored'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  function rowValidationMessage(row: EditableRetailRow) {
    if (row.previewValid === false && row.previewValidationErrors.length) {
      return row.previewValidationErrors[0];
    }
    if (row.previewValid === null && row.validationStatus === 'ERROR') {
      return row.validationErrors[0];
    }
    return null;
  }

  return (
    <>
      <PricingHubNav activeTab="retail" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.retailHint')}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pricing.searchProducts')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
      />

      <div className={markupTable.wrapper}>
        <table className={markupTable.table}>
          <thead className={markupTable.thead}>
            <MarkupTableHeaders />
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => {
              const validationMessage = rowValidationMessage(row);
              const hasError = validationMessage != null;
              return (
                <tr key={row.id} className={hasError ? 'bg-red-50/60' : undefined}>
                  <td className={markupTable.tdProduct}>
                    <p className={markupTable.productName} title={row.name}>
                      {row.name}
                    </p>
                    <p className={markupTable.productSku} title={row.sku}>
                      {row.sku}
                    </p>
                  </td>
                  <td className={markupTable.tdCategory} title={row.categoryName}>
                    {row.categoryName}
                  </td>
                  <td className={markupTable.tdMoney}>{formatCompactMoney(row.effectiveBranchPriceKgs)}</td>
                  <td className={markupTable.tdPercent}>
                    {canManage ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.draftMinMarkup}
                        onChange={(e) => updateMinMarkup(row.id, Number(e.target.value))}
                        className={markupTable.input}
                      />
                    ) : (
                      formatCompactPercent(row.minimumRetailMarkupPercent)
                    )}
                  </td>
                  <PreviewPriceCell
                    value={row.displayMinPrice}
                    flash={row.flash.min}
                    previewing={row.isPreviewing}
                  />
                  <td className={markupTable.tdPercent}>
                    {canManage ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.draftRecommendedMarkup}
                        onChange={(e) => updateRecommendedMarkup(row.id, Number(e.target.value))}
                        className={markupTable.input}
                      />
                    ) : (
                      formatCompactPercent(row.recommendedRetailMarkupPercent)
                    )}
                  </td>
                  <PreviewPriceCell
                    value={row.displayRecPrice}
                    flash={row.flash.rec}
                    previewing={row.isPreviewing}
                  />
                  <td className={markupTable.tdPercent}>
                    <span className="inline-flex items-center justify-center">
                      {formatCompactPercent(row.displayMaxMarkup)}
                      <MaximumMarkupSourceDot
                        source={row.displayMaxSource}
                        inheritedLabel={t('pricing.maximumMarkupSourceInherited')}
                        ceoLabel={t('pricing.maximumMarkupSourceCeo')}
                      />
                    </span>
                  </td>
                  <PreviewPriceCell
                    value={row.displayMaxPrice}
                    flash={row.flash.max}
                    previewing={row.isPreviewing}
                  />
                  <td className={markupTable.tdUpdated} title={row.lastUpdated ?? undefined}>
                    {formatCompactDate(row.lastUpdated)}
                  </td>
                  <td className={markupTable.tdActions}>
                    {canManage ? (
                      <RowActionsMenu
                        disabled={savingId === row.id}
                        canSave={savingId !== row.id && row.previewValid !== false}
                        isDirty={row.isDirty}
                        hasOverride={row.maximumRetailMarkupSource === 'CEO_PRODUCT_OVERRIDE'}
                        onSave={() => void save(row.id)}
                        onCancel={() => cancelRowEdits(row.id)}
                        onOverride={() => setOverrideRow(row)}
                        onRestore={() => void restoreInheritance(row.id)}
                        saveLabel={t('common.save')}
                        cancelLabel={t('common.cancel')}
                        overrideLabel={t('pricing.changeMaximumMarkup')}
                        restoreLabel={t('pricing.restoreInheritedMaximum')}
                      />
                    ) : (
                      '—'
                    )}
                    {hasError ? (
                      <p className="mt-0.5 truncate text-[9px] text-red-600" title={validationMessage ?? undefined}>
                        !
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MaximumMarkupOverrideModal
        open={overrideRow != null}
        title={t('pricing.changeMaximumMarkup')}
        channel="retail"
        productId={overrideRow?.id}
        minimumMarkupPercent={rows.find((row) => row.id === overrideRow?.id)?.draftMinMarkup}
        recommendedMarkupPercent={rows.find((row) => row.id === overrideRow?.id)?.draftRecommendedMarkup}
        inheritedMaximumMarkupPercent={overrideRow?.inheritedMaximumRetailMarkupPercent ?? 0}
        currentOverridePercent={overrideRow?.maximumRetailMarkupOverridePercent ?? null}
        onClose={() => setOverrideRow(null)}
        onSubmit={async (payload) => {
          if (!overrideRow) return;
          const saved = await apiFetch<RetailRow>(`/pricing/retail/${overrideRow.id}/maximum-markup-override`, {
            method: 'PUT',
            body: JSON.stringify({
              maximumRetailMarkupOverridePercent: payload.overridePercent,
              overrideReasonCode: payload.overrideReasonCode,
              overrideReasonComment: payload.overrideReasonComment,
            }),
          });
          setRows((current) =>
            current.map((item) =>
              item.id === overrideRow.id ? toEditableRow({ ...item, ...saved }) : item,
            ),
          );
          setSuccess(t('pricing.maximumMarkupOverridden'));
          setOverrideRow(null);
        }}
      />
    </>
  );
}
