'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '../../components/protected-shell';
import { Card, PageHeader } from '../../components/ui';
import { apiFetch } from '../../lib/api';

type ServiceOrder = {
  id: string;
  number: string;
  status: string;
  problem: string;
  createdAt: string;
  customer?: { fullName: string } | null;
};

export default function ServicePage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);

  useEffect(() => {
    apiFetch<ServiceOrder[]>('/service').then(setOrders);
  }, []);

  return (
    <ProtectedShell>
      <PageHeader
        title="Service"
        description="Diagnostics, repairs, warranties, and master assignment."
        action={
          <Link
            href="/service/new"
            className="rounded-xl bg-brand-600 px-5 py-3 font-bold text-white"
          >
            New Work Order
          </Link>
        }
      />
      <Card className="overflow-hidden">
        {orders.map((order) => (
          <Link
            href={`/service/${order.id}`}
            key={order.id}
            className="block border-b border-slate-100 p-5 hover:bg-slate-50"
          >
            <p className="font-black text-slate-950">
              {order.number} · {order.status}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {order.customer?.fullName ?? 'No customer'} · {order.problem}
            </p>
          </Link>
        ))}
        {orders.length === 0 ? (
          <p className="p-8 text-center text-slate-500">No service orders yet.</p>
        ) : null}
      </Card>
    </ProtectedShell>
  );
}
