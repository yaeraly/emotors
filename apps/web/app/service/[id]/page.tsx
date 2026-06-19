'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '../../../components/protected-shell';
import { Card, PageHeader } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';

type ServiceOrder = {
  number: string;
  status: string;
  problem: string;
  diagnostic?: string;
  vehicleInfo?: string;
  tasks: Array<{ id: string; title: string; status: string; laborCost: string }>;
  warranties: Array<{ id: string; title: string; expiresAt: string }>;
};

export default function ServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);

  useEffect(() => {
    apiFetch<ServiceOrder>(`/service/${params.id}`).then(setOrder);
  }, [params.id]);

  return (
    <ProtectedShell>
      <PageHeader
        title={order?.number ?? 'Service Order'}
        description="Repair status, diagnostic notes, assigned tasks, and warranties."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Diagnostics</h3>
          <p className="mt-3 text-sm text-slate-500">Status: {order?.status}</p>
          <p className="mt-4 font-semibold">{order?.problem}</p>
          <p className="mt-2 text-sm text-slate-600">
            {order?.diagnostic ?? 'No diagnostics yet.'}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Vehicle: {order?.vehicleInfo ?? '-'}
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Repair Tasks</h3>
          <div className="mt-4 space-y-3">
            {order?.tasks.map((task) => (
              <div key={task.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-bold">{task.title}</p>
                <p className="text-sm text-slate-500">{task.status}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-black text-slate-950">Warranty</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {order?.warranties.map((warranty) => (
              <div key={warranty.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-bold">{warranty.title}</p>
                <p className="text-sm text-slate-500">
                  Expires {new Date(warranty.expiresAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </ProtectedShell>
  );
}
