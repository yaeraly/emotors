'use client';

import { InfoPopover } from '@/components/InfoPopover';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  minimumPrice: number;
  recommendedPrice: number;
  maximumPrice: number | null;
  hasMaximumPrice: boolean;
  hasPricingPolicy: boolean;
};

function formatSom(value: number) {
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} сом`;
}

export function SaleLinePricingTooltip({
  minimumPrice,
  recommendedPrice,
  maximumPrice,
  hasMaximumPrice,
  hasPricingPolicy,
}: Props) {
  const { t } = useTranslation();

  const minimumLabel = hasPricingPolicy && minimumPrice > 0
    ? formatSom(minimumPrice)
    : t('sales.pricingTooltip.notConfigured');
  const recommendedLabel = hasPricingPolicy && recommendedPrice > 0
    ? formatSom(recommendedPrice)
    : t('sales.pricingTooltip.notConfigured');
  const maximumLabel =
    hasPricingPolicy && hasMaximumPrice && maximumPrice != null && maximumPrice > 0
      ? formatSom(maximumPrice)
      : t('sales.pricingTooltip.notConfigured');

  return (
    <InfoPopover
      label={t('sales.pricingInfoAriaLabel')}
      content={
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {t('pricing.minimumSellingPrice')}: {minimumLabel}
            </p>
            <p className="mt-1 text-slate-500">{t('sales.pricingTooltip.minimumHint')}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {t('pricing.recommendedRetailPrice')}: {recommendedLabel}
            </p>
            <p className="mt-1 text-slate-500">{t('sales.pricingTooltip.recommendedHint')}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {t('sales.maximumPrice')}: {maximumLabel}
            </p>
            <p className="mt-1 text-slate-500">{t('sales.pricingTooltip.maximumHint')}</p>
          </div>
        </div>
      }
    />
  );
}
