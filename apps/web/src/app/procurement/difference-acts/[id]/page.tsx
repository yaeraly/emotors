'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementHubNav } from '@/components/procurement/ProcurementHubNav';
import { apiFetch } from '@/lib/api';
import { canViewChinaReceivingActs } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type DifferenceActDetail = {
  id: string;
  actNumber: string;
  orderNumber: string;
  procurementOrderId: string;
  supplier?: { id: string; name: string } | null;
  factory?: { id: string; name: string } | null;
  hqWarehouse?: { id: string; name: string; code?: string } | null;
  productName: string;
  sku: string;
  type: string;
  status: string;
  expectedQuantity: number;
  actualQuantity: number;
  damagedQuantity: number;
  differenceQuantity: number;
  reason?: string | null;
  note?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  createdAt: string;
  receivingNumber?: string | null;
};

export default function ProcurementDifferenceActDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [act, setAct] = useState<DifferenceActDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<DifferenceActDetail>(`/procurement/difference-acts/${params.id}`),
    ])
      .then(([me, detail]) => {
        setUser(me);
        setAct(detail);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [params.id, t]);

  if (user && !canViewChinaReceivingActs(user)) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{act?.actNumber ?? '...'}</h2>
            <p className="text-sm text-slate-500">{t('chinaReceiving.differenceActs')}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/procurement/difference-acts" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
              {t('common.back')}
            </Link>
            {act ? (
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                {t('chinaReceiving.printAct')}
              </button>
            ) : null}
          </div>
        </div>

        <ProcurementHubNav activeTab="difference-acts" />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {act ? (
          <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <DetailField label={t('chinaReceiving.orderNumber')} value={act.orderNumber} />
            <DetailField label={t('procurement.orders.supplier')} value={act.supplier?.name ?? '—'} />
            <DetailField label={t('procurement.orders.factory')} value={act.factory?.name ?? '—'} />
            <DetailField label={t('procurement.orders.product')} value={`${act.productName} (${act.sku})`} />
            <DetailField label={t('chinaReceiving.expectedQty')} value={String(act.expectedQuantity)} />
            <DetailField label={t('chinaReceiving.actualQty')} value={String(act.actualQuantity)} />
            <DetailField label={t('chinaReceiving.damagedQty')} value={String(act.damagedQuantity)} />
            <DetailField label={t('procurement.orders.difference')} value={String(act.differenceQuantity)} />
            <DetailField label={t('chinaReceiving.differenceType')} value={translateStatus(t, act.type)} />
            <DetailField label={t('chinaReceiving.targetWarehouse')} value={act.hqWarehouse?.name ?? '—'} />
            <DetailField label={t('common.status')} value={translateStatus(t, act.status)} />
            <DetailField label={t('chinaReceiving.warehouseManager')} value={act.createdBy?.fullName ?? '—'} />
            <DetailField label={t('chinaReceiving.actDate')} value={new Date(act.createdAt).toLocaleString()} />
            <DetailField label={t('chinaReceiving.batchNumber')} value={act.receivingNumber ?? '—'} />
            <DetailField label={t('chinaReceiving.reason')} value={act.reason ?? act.note ?? '—'} className="md:col-span-2" />
          </div>
        ) : (
          <p className="text-slate-500">{t('common.loading')}</p>
        )}
      </section>
    </ProtectedShell>
  );
}

function DetailField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
