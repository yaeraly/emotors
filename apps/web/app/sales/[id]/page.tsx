'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '../../../components/protected-shell';
import { Card, PageHeader } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';

type Sale = {
  id: string;
  number: string;
  total: string;
  paidAmount: string;
  debtAmount: string;
  paymentStatus: string;
  items: Array<{ id: string; description: string; quantity: number; total: string }>;
  payments: Array<{ id: string; amount: string; method: string; paidAt: string }>;
  installments: Array<{ id: string; amount: string; dueDate: string; status: string }>;
  receipt?: { number: string; qrPayload: string } | null;
};

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [amount, setAmount] = useState(0);

  const load = async () => {
    setSale(await apiFetch<Sale>(`/sales/${params.id}`));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const addPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch(`/sales/${params.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, method: 'CASH' }),
    });
    setAmount(0);
    await load();
  };

  return (
    <ProtectedShell>
      <PageHeader
        title={sale?.number ?? 'Sale'}
        description="Receipt, QR payload, installment schedule, and payment tracking."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-4">
            <div>
              <p className="text-sm text-slate-500">Total</p>
              <p className="text-2xl font-black">{sale?.total} KGS</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Paid</p>
              <p className="text-2xl font-black">{sale?.paidAmount}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Debt</p>
              <p className="text-2xl font-black">{sale?.debtAmount}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Status</p>
              <p className="text-2xl font-black">{sale?.paymentStatus}</p>
            </div>
          </div>
          <div className="p-5">
            <h3 className="font-black text-slate-950">Items</h3>
            <div className="mt-3 space-y-2">
              {sale?.items.map((item) => (
                <div key={item.id} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold">{item.description}</p>
                  <p className="text-sm text-slate-500">
                    Qty {item.quantity} · {item.total} KGS
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-200 p-5">
            <h3 className="font-black text-slate-950">Payments</h3>
            <div className="mt-3 space-y-2">
              {sale?.payments.map((payment) => (
                <div key={payment.id} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold">
                    {payment.amount} KGS · {payment.method}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(payment.paidAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-black text-slate-950">Add Payment</h3>
            <form onSubmit={addPayment} className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                type="number"
                min={0.01}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                required
              />
              <button className="w-full rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
                Record Payment
              </button>
            </form>
          </Card>
          <Card className="p-5">
            <h3 className="font-black text-slate-950">Receipt</h3>
            <p className="mt-3 text-sm text-slate-600">
              Number: {sale?.receipt?.number ?? '-'}
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-white">
              {sale?.receipt?.qrPayload ?? 'No QR payload'}
            </pre>
          </Card>
          <Card className="p-5">
            <h3 className="font-black text-slate-950">Installments</h3>
            <div className="mt-3 space-y-2">
              {sale?.installments.map((installment) => (
                <div key={installment.id} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold">{installment.amount} KGS</p>
                  <p className="text-sm text-slate-500">
                    {new Date(installment.dueDate).toLocaleDateString()} ·{' '}
                    {installment.status}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </ProtectedShell>
  );
}
