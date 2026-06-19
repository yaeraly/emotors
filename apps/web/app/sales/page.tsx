'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '../../components/protected-shell';
import { Card, PageHeader } from '../../components/ui';
import { apiFetch } from '../../lib/api';

type Sale = {
  id: string;
  number: string;
  total: string;
  paidAmount: string;
  debtAmount: string;
  paymentStatus: string;
  createdAt: string;
  customer?: { fullName: string } | null;
};

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    apiFetch<Sale[]>('/sales').then(setSales);
  }, []);

  return (
    <ProtectedShell>
      <PageHeader
        title="Sales"
        description="Create sales, issue receipts, track payments and installments."
        action={
          <Link
            href="/sales/new"
            className="rounded-xl bg-brand-600 px-5 py-3 font-bold text-white"
          >
            New Sale
          </Link>
        }
      />
      <Card className="overflow-hidden">
        {sales.map((sale) => (
          <Link
            href={`/sales/${sale.id}`}
            key={sale.id}
            className="grid gap-3 border-b border-slate-100 p-5 hover:bg-slate-50 md:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-black text-slate-950">{sale.number}</p>
              <p className="text-sm text-slate-500">
                {sale.customer?.fullName ?? 'Walk-in customer'} ·{' '}
                {new Date(sale.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="font-bold">{sale.total} KGS</p>
              <p className="text-sm text-slate-500">
                {sale.paymentStatus} · Debt {sale.debtAmount}
              </p>
            </div>
          </Link>
        ))}
        {sales.length === 0 ? (
          <p className="p-8 text-center text-slate-500">No sales yet.</p>
        ) : null}
      </Card>
    </ProtectedShell>
  );
}
