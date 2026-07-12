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

type WholesaleRow = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  effectiveBranchPriceKgs: number;
  minimumWholesaleMarkupPercent: number;
  minimumWholesalePriceKgs: number;
  recommendedWholesaleMarkupPercent: number;
  recommendedWholesalePriceKgs: number;
  inheritedMaximumWholesaleMarkupPercent: number;
  maximumWholesaleMarkupOverridePercent: number | null;
  effectiveMaximumWholesaleMarkupPercent: number;
  maximumWholesalePriceKgs: number;
  maximumWholesaleMarkupSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  validationStatus: 'OK' | 'ERROR';
  validationErrors: string[];
  lastUpdated: string | null;
};

function toEditableRow(product: WholesaleRow): EditableMarkupRow {
  return {
    ...product,
    ...createMarkupRowEditorState(product, 'wholesale'),
  };
}

export default function PricingWholesalePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableMarkupRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [overrideRow, setOverrideRow] = useState<EditableMarkupRow | null>(null);

  const canManage = canManagePricingPolicy(user);
  const { schedulePreview, cancelRowEdits, cancelRowPreviews, markRowSaved } = usePricingMarkupPreview('wholesale', setRows);

  async function load() {
    const [products, me] = await Promise.all([
      apiFetch<WholesaleRow[]>('/pricing/wholesale'),
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
      const saved = await apiFetch<WholesaleRow>(`/pricing/wholesale/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          minimumWholesaleMarkupPercent: row.draftMinMarkup,
          recommendedWholesaleMarkupPercent: row.draftRecommendedMarkup,
          ...resolveMaxOverridePayload(row, 'wholesale'),
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
      const saved = await apiFetch<WholesaleRow>(`/pricing/wholesale/${productId}/maximum-markup-override`, {
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
      <PricingHubNav activeTab="wholesale" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}
      <p className="text-xs text-slate-500">{t('pricing.wholesaleHint')}</p>

      <MarkupPricingTable
        channel="wholesale"
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
        channel="wholesale"
        productId={overrideRow?.id}
        minimumMarkupPercent={rows.find((row) => row.id === overrideRow?.id)?.draftMinMarkup ?? undefined}
        recommendedMarkupPercent={rows.find((row) => row.id === overrideRow?.id)?.draftRecommendedMarkup ?? undefined}
        inheritedMaximumMarkupPercent={overrideRow?.inheritedMaximumWholesaleMarkupPercent ?? 0}
        currentOverridePercent={overrideRow?.maximumWholesaleMarkupOverridePercent ?? null}
        onClose={() => setOverrideRow(null)}
        onSubmit={async (payload) => {
          if (!overrideRow) return;
          const saved = await apiFetch<WholesaleRow>(`/pricing/wholesale/${overrideRow.id}/maximum-markup-override`, {
            method: 'PUT',
            body: JSON.stringify({
              maximumWholesaleMarkupOverridePercent: payload.overridePercent,
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
