'use client';

import { InfoPopover } from '@/components/InfoPopover';
import { useTranslation } from '@/i18n/useTranslation';
import { formatKgsLocalized } from '@/lib/money';
import { buildSaleLinePricingTooltipContent } from '@/lib/sale-line-pricing-tooltip.util';

type Props = {
  minimumPrice: number;
  recommendedPrice: number;
  maximumPrice: number | null;
  hasMaximumPrice: boolean;
  hasPricingPolicy: boolean;
};

function formatMoneyKgs(value: number) {
  return `${formatKgsLocalized(value)} KGS`;
}

export function SaleLinePricingTooltip({
  minimumPrice,
  recommendedPrice,
  maximumPrice,
  hasMaximumPrice,
  hasPricingPolicy,
}: Props) {
  const { t } = useTranslation();

  const content = buildSaleLinePricingTooltipContent({
    minimumPrice,
    recommendedPrice,
    maximumPrice,
    hasMaximumPrice,
    hasPricingPolicy,
    formatMoney: formatMoneyKgs,
    labels: {
      title: t('sales.pricingTooltip.rangeTitle'),
      minimum: t('pricing.minimumSellingPrice'),
      recommended: t('sales.recommendedPrice'),
      maximum: t('sales.maximumPrice'),
      notConfigured: t('sales.pricingTooltip.rangeNotConfigured'),
      valueNotConfigured: t('sales.pricingTooltip.notConfigured'),
    },
  });

  return (
    <InfoPopover
      label={t('sales.pricingInfoAriaLabel')}
      content={
        <div className="space-y-2">
          <p className="font-semibold text-slate-900 dark:text-slate-100">{content.title}</p>
          {content.lines.map((line) => (
            <p key={line} className="text-slate-700 dark:text-slate-200">
              {line}
            </p>
          ))}
        </div>
      }
    />
  );
}
