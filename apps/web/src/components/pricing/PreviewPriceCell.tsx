'use client';

import { formatCompactMoney, markupTable } from '@/components/pricing/pricing-markup-table-ui';

type PreviewPriceCellProps = {
  value: number;
  flash?: boolean;
  previewing?: boolean;
};

export function PreviewPriceCell({ value, flash = false, previewing = false }: PreviewPriceCellProps) {
  return (
    <td
      className={`${markupTable.tdMoney} transition-colors duration-500 ${
        flash ? 'bg-emerald-100' : previewing ? 'text-slate-400' : ''
      }`}
    >
      {formatCompactMoney(value)}
    </td>
  );
}
