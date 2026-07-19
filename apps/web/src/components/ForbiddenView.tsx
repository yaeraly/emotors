'use client';

import { useTranslation } from '@/i18n/useTranslation';

type ForbiddenViewProps = {
  message?: string;
};

export function ForbiddenView({ message }: ForbiddenViewProps) {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl border border-red-200 bg-white p-12 text-center shadow-sm">
      <p className="text-5xl font-bold text-red-600">403</p>
      <p className="mt-4 text-xl font-semibold text-slate-900">{t('common.forbiddenTitle')}</p>
      <p className="mt-2 max-w-md text-slate-500">{message ?? t('common.forbiddenMessage')}</p>
    </main>
  );
}
