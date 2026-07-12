'use client';

import { formatCompactMoney, markupGroup, markupTable } from '@/components/pricing/pricing-markup-table-ui';

type PreviewPriceCellProps = {
  value: number;
  flash?: boolean;
  previewing?: boolean;
  variant: 'min' | 'rec' | 'max';
};

export function PreviewPriceCell({ value, flash = false, previewing = false, variant }: PreviewPriceCellProps) {
  const group = markupGroup[variant];
  return (
    <td
      className={`${markupTable.tdMoney} ${group.price} transition-colors duration-500 ${
        flash ? 'ring-1 ring-inset ring-emerald-300' : previewing ? 'text-slate-400' : ''
      }`}
    >
      {formatCompactMoney(value)}
    </td>
  );
}
