'use client';

import { MaximumMarkupOverrideModal } from '@/components/pricing/MaximumMarkupOverrideModal';
import { PreviewPriceCell } from '@/components/pricing/PreviewPriceCell';
import { PriceExplanationButton } from '@/components/pricing/PriceExplanationButton';
import {
  MarkupTableHeaders,
  MaximumMarkupSourceDot,
  RowActionsMenu,
  formatCompactMoney,
  formatCompactPercent,
  markupGroup,
  markupTable,
} from '@/components/pricing/pricing-markup-table-ui';
import {
  canSubmitMarkupRow,
  isMarkupRowDirty,
  resolveMaxOverridePayload,
  type MarkupRowEditorState,
} from '@/lib/pricing-markup-preview';
import { formatMarkupInputValue, parseMarkupInput } from '@/lib/pricing-roundup-preview';

type MarkupChannel = 'retail' | 'wholesale';

type BaseProductRow = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  effectiveBranchPriceKgs: number;
  masterBranchPriceKgs?: number;
  ruleApplied?: boolean;
  displayBranchId?: string | null;
  inheritedMaximumRetailMarkupPercent?: number;
  inheritedMaximumWholesaleMarkupPercent?: number;
  maximumRetailMarkupOverridePercent?: number | null;
  maximumWholesaleMarkupOverridePercent?: number | null;
  maximumRetailMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  maximumWholesaleMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  minimumRetailMarkupPercent?: number;
  minimumWholesaleMarkupPercent?: number;
  recommendedRetailMarkupPercent?: number;
  recommendedWholesaleMarkupPercent?: number;
  validationStatus?: 'OK' | 'ERROR';
  validationErrors?: string[];
};

export type EditableMarkupRow = BaseProductRow & MarkupRowEditorState;

type MarkupPricingTableProps = {
  channel: MarkupChannel;
  rows: EditableMarkupRow[];
  canManage: boolean;
  savingId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onPatchRow: (productId: string, patch: Partial<EditableMarkupRow>) => void;
  onSave: (productId: string) => void;
  onCancel: (productId: string) => void;
  onRestore: (productId: string) => void;
  onOpenOverride: (row: EditableMarkupRow) => void;
  rowValidationMessage: (row: EditableMarkupRow) => string | null;
  displayBranchId?: string;
  t: (key: string) => string;
};

function savedMinMarkup(row: EditableMarkupRow, channel: MarkupChannel) {
  return channel === 'retail' ? row.minimumRetailMarkupPercent : row.minimumWholesaleMarkupPercent;
}

function savedRecMarkup(row: EditableMarkupRow, channel: MarkupChannel) {
  return channel === 'retail' ? row.recommendedRetailMarkupPercent : row.recommendedWholesaleMarkupPercent;
}

export function MarkupPricingTable({
  channel,
  rows,
  canManage,
  savingId,
  search,
  onSearchChange,
  onPatchRow,
  onSave,
  onCancel,
  onRestore,
  onOpenOverride,
  rowValidationMessage,
  displayBranchId,
  t,
}: MarkupPricingTableProps) {
  const query = search.trim().toLowerCase();
  const filteredRows = query
    ? rows.filter((row) => [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query))
    : rows;

  return (
    <>
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
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
              const isDirty = row.isDirty || isMarkupRowDirty(row);
              const hasOverride =
                channel === 'retail'
                  ? row.maximumRetailMarkupSource === 'CEO_PRODUCT_OVERRIDE'
                  : row.maximumWholesaleMarkupSource === 'CEO_PRODUCT_OVERRIDE';

              return (
                <tr key={row.id} className={hasError ? 'bg-red-50/60' : undefined}>
                  <td className={markupTable.tdProduct}>
                    <p className={markupTable.productName} title={row.name}>
                      {row.name}
                    </p>
                    <p className={markupTable.productSku} title={row.sku}>
                      {row.sku}
                    </p>
                    {isDirty ? (
                      <p className="mt-0.5 text-[10px] font-semibold text-amber-600">{t('pricing.unsavedRow')}</p>
                    ) : null}
                  </td>
                  <td className={markupTable.tdCategory} title={row.categoryName}>
                    {row.categoryName}
                  </td>
                  <td className={markupTable.tdMoney}>
                    <div className="flex flex-col items-end gap-0.5">
                      {row.masterBranchPriceKgs != null &&
                      Math.abs(row.masterBranchPriceKgs - row.effectiveBranchPriceKgs) > 0.001 ? (
                        <span className="text-[10px] text-slate-400">
                          {t('pricing.colMasterPrice')}: {formatCompactMoney(row.masterBranchPriceKgs)}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        {formatCompactMoney(row.effectiveBranchPriceKgs)}
                        {row.ruleApplied && !row.isDirty ? (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800">
                            {t('pricing.ruleAppliedBadge')}
                          </span>
                        ) : null}
                        <PriceExplanationButton
                          productId={row.id}
                          branchId={displayBranchId ?? row.displayBranchId}
                          priceType={channel === 'retail' ? 'RETAIL_RECOMMENDED' : 'WHOLESALE_RECOMMENDED'}
                        />
                      </span>
                    </div>
                  </td>
                  <td className={`${markupTable.tdPercent} ${markupGroup.min.cell}`}>
                    {canManage ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatMarkupInputValue(row.draftMinMarkup)}
                        onChange={(e) =>
                          onPatchRow(row.id, { draftMinMarkup: parseMarkupInput(e.target.value) })
                        }
                        className={`${markupTable.input} ${markupGroup.min.input}`}
                      />
                    ) : (
                      formatCompactPercent(Number(savedMinMarkup(row, channel) ?? 0))
                    )}
                  </td>
                  <PreviewPriceCell
                    value={row.displayMinPrice}
                    flash={row.flash.min}
                    previewing={row.isPreviewing}
                    variant="min"
                  />
                  <td className={`${markupTable.tdPercent} ${markupGroup.rec.cell}`}>
                    {canManage ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatMarkupInputValue(row.draftRecommendedMarkup)}
                        onChange={(e) =>
                          onPatchRow(row.id, { draftRecommendedMarkup: parseMarkupInput(e.target.value) })
                        }
                        className={`${markupTable.input} ${markupGroup.rec.input}`}
                      />
                    ) : (
                      formatCompactPercent(Number(savedRecMarkup(row, channel) ?? 0))
                    )}
                  </td>
                  <PreviewPriceCell
                    value={row.displayRecPrice}
                    flash={row.flash.rec}
                    previewing={row.isPreviewing}
                    variant="rec"
                  />
                  <td className={`${markupTable.tdPercent} ${markupGroup.max.cell}`}>
                    {canManage ? (
                      <span className="inline-flex items-center justify-center gap-0.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatMarkupInputValue(row.draftMaxMarkup)}
                          onChange={(e) =>
                            onPatchRow(row.id, { draftMaxMarkup: parseMarkupInput(e.target.value) })
                          }
                          className={`${markupTable.input} ${markupGroup.max.input}`}
                        />
                        <MaximumMarkupSourceDot
                          source={row.displayMaxSource}
                          inheritedLabel={t('pricing.maximumMarkupSourceInherited')}
                          ceoLabel={t('pricing.maximumMarkupSourceCeo')}
                        />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center">
                        {formatCompactPercent(row.displayMaxMarkup)}
                        <MaximumMarkupSourceDot
                          source={row.displayMaxSource}
                          inheritedLabel={t('pricing.maximumMarkupSourceInherited')}
                          ceoLabel={t('pricing.maximumMarkupSourceCeo')}
                        />
                      </span>
                    )}
                  </td>
                  <PreviewPriceCell
                    value={row.displayMaxPrice}
                    flash={row.flash.max}
                    previewing={row.isPreviewing}
                    variant="max"
                  />
                  <td className={markupTable.tdActions}>
                    {canManage ? (
                      <RowActionsMenu
                        disabled={savingId === row.id}
                        canSave={savingId !== row.id && row.previewValid !== false && canSubmitMarkupRow(row)}
                        isDirty={isDirty}
                        hasOverride={hasOverride}
                        onSave={() => onSave(row.id)}
                        onCancel={() => onCancel(row.id)}
                        onOverride={() => onOpenOverride(row)}
                        onRestore={() => onRestore(row.id)}
                        saveLabel={savingId === row.id ? t('common.saving') : t('common.save')}
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
    </>
  );
}

export { resolveMaxOverridePayload, canSubmitMarkupRow } from '@/lib/pricing-markup-preview';
