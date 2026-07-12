'use client';

import { useEffect, useState } from 'react';
import { MaximumMarkupOverrideModal } from '@/components/pricing/MaximumMarkupOverrideModal';
import { MarkupPricingTable, type EditableMarkupRow, canSubmitMarkupRow, resolveMaxOverridePayload } from '@/components/pricing/MarkupPricingTable';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { usePricingMarkupPreview } from '@/hooks/use-pricing-markup-preview';
import { apiFetch } from '@/lib/api';
import { createMarkupRowEditorState, isMarkupRowDirty } from '@/lib/pricing-markup-preview';
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

function toEditableRow(product: RetailRow): EditableMarkupRow {
  return {
    ...product,
    ...createMarkupRowEditorState(product, 'retail'),
  };
}

export default function PricingRetailPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableMarkupRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [overrideRow, setOverrideRow] = useState<EditableMarkupRow | null>(null);

  const canManage = canManagePricingPolicy(user);
  const { schedulePreview, cancelRowEdits, cancelRowPreviews, markRowSaved } = usePricingMarkupPreview('retail', setRows);

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

  function patchRow(productId: string, patch: Partial<EditableMarkupRow>) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const next = { ...row, ...patch };
        next.isDirty = isMarkupRowDirty(next);
        schedulePreview(productId, next);
        return next;
      }),
    );
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;
    if (!canSubmitMarkupRow(row)) {
      setError(t('pricing.invalidMarkup'));
      return;
    }
    if (row.previewValid === false) {
      setError(row.previewValidationErrors[0] ?? t('common.error'));
      return;
    }

    setSavingId(productId);
    setError('');
    setSuccess('');
    cancelRowPreviews(productId);
    try {
      const saved = await apiFetch<RetailRow>(`/pricing/retail/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          minimumSellingMarkupPercent: row.draftMinMarkup,
          recommendedRetailMarkupPercent: row.draftRecommendedMarkup,
          ...resolveMaxOverridePayload(row, 'retail'),
        }),
      });
      markRowSaved(productId);
      setRows((current) => current.map((item) => (item.id === productId ? toEditableRow(saved) : item)));
      setSuccess(t('pricing.markupsSaved'));
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
      markRowSaved(productId);
      setRows((current) => current.map((item) => (item.id === productId ? toEditableRow(saved) : item)));
      setSuccess(t('pricing.inheritanceRestored'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  function rowValidationMessage(row: EditableMarkupRow) {
    if (row.previewValid === false && row.previewValidationErrors.length) {
      return row.previewValidationErrors[0];
    }
    if (row.previewValid === null && row.validationStatus === 'ERROR') {
      return row.validationErrors?.[0] ?? null;
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

      <MarkupPricingTable
        channel="retail"
        rows={rows}
        canManage={canManage}
        savingId={savingId}
        search={search}
        onSearchChange={setSearch}
        onPatchRow={patchRow}
        onSave={(id) => void save(id)}
        onCancel={cancelRowEdits}
        onRestore={(id) => void restoreInheritance(id)}
        onOpenOverride={setOverrideRow}
        rowValidationMessage={rowValidationMessage}
        t={t}
      />

      <MaximumMarkupOverrideModal
        open={overrideRow != null}
        title={t('pricing.changeMaximumMarkup')}
        channel="retail"
        productId={overrideRow?.id}
        minimumMarkupPercent={rows.find((row) => row.id === overrideRow?.id)?.draftMinMarkup ?? undefined}
        recommendedMarkupPercent={rows.find((row) => row.id === overrideRow?.id)?.draftRecommendedMarkup ?? undefined}
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
          markRowSaved(overrideRow.id);
          setRows((current) => current.map((item) => (item.id === overrideRow.id ? toEditableRow(saved) : item)));
          setSuccess(t('pricing.maximumMarkupOverridden'));
          setOverrideRow(null);
        }}
      />
    </>
  );
}
