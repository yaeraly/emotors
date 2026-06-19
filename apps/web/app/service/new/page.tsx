'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '../../../components/protected-shell';
import { Card, PageHeader } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';

type ServiceOrderResponse = { id: string };

export default function NewServicePage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [problem, setProblem] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [taskTitle, setTaskTitle] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const order = await apiFetch<ServiceOrderResponse>('/service', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customerId || undefined,
        assignedUserId: assignedUserId || undefined,
        vehicleInfo: vehicleInfo || undefined,
        problem,
        diagnostic: diagnostic || undefined,
        tasks: taskTitle ? [{ title: taskTitle }] : [],
      }),
    });
    router.replace(`/service/${order.id}`);
  };

  return (
    <ProtectedShell>
      <PageHeader
        title="New Work Order"
        description="Open a diagnostics and repair workflow."
      />
      <Card className="max-w-3xl p-6">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <input
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Customer ID (optional)"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          />
          <input
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Master/User ID (optional)"
            value={assignedUserId}
            onChange={(event) => setAssignedUserId(event.target.value)}
          />
          <input
            className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
            placeholder="Vehicle info"
            value={vehicleInfo}
            onChange={(event) => setVehicleInfo(event.target.value)}
          />
          <textarea
            className="min-h-28 rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
            placeholder="Problem"
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
            required
          />
          <textarea
            className="min-h-28 rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
            placeholder="Diagnostic notes"
            value={diagnostic}
            onChange={(event) => setDiagnostic(event.target.value)}
          />
          <input
            className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
            placeholder="Initial task"
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
          />
          <button className="rounded-xl bg-brand-600 px-5 py-3 font-bold text-white md:col-span-2">
            Create Work Order
          </button>
        </form>
      </Card>
    </ProtectedShell>
  );
}
