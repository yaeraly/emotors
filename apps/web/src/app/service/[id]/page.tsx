'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product, ProductListResponse, ServiceOrder, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [diagnosis, setDiagnosis] = useState({ problem: '', result: '', recommendedRepair: '', diagnosisFee: '0' });
  const [repair, setRepair] = useState({ description: '', laborCost: '0' });
  const [part, setPart] = useState({ productId: '', warehouseId: '', quantity: '1', unitPrice: '' });
  const [warrantyUntil, setWarrantyUntil] = useState('');

  async function load() {
    try {
      const [orderResult, productResult, warehouseResult] = await Promise.all([
        apiFetch<ServiceOrder>(`/service-orders/${id}`),
        apiFetch<ProductListResponse>('/inventory/products?pageSize=200'),
        apiFetch<Warehouse[]>('/inventory/warehouses'),
      ]);
      setOrder(orderResult);
      setProducts(productResult.items);
      setWarehouses(warehouseResult);
      setPart((current) => ({
        ...current,
        productId: current.productId || productResult.items[0]?.id || '',
        warehouseId: current.warehouseId || warehouseResult[0]?.id || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function post(path: string, payload: unknown) {
    setError('');
    try {
      setOrder(await apiFetch<ServiceOrder>(`/service-orders/${id}/${path}`, { method: 'POST', body: JSON.stringify(payload) }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p><h2 className="text-3xl font-bold text-slate-950">{order?.orderNumber ?? '-'}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {order ? <>
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
            <Info label={t('service.customer')} value={order.customer?.fullName ?? ''} />
            <Info label={t('service.master')} value={order.master?.fullName ?? ''} />
            <Info label={t('service.status')} value={order.status} />
            <Info label={t('service.totalAmount')} value={formatKgs(order.totalAmount)} />
            <Info label={t('service.problem')} value={order.problemDescription} />
            <Info label={t('service.laborCost')} value={formatKgs(order.laborCost)} />
            <Info label={t('service.partsCost')} value={formatKgs(order.partsCost)} />
            <Info label={t('sales.debtAmount')} value={formatKgs(order.debtAmount)} />
          </section>
          <div className="grid gap-6 xl:grid-cols-3">
            <ActionForm title={t('service.addDiagnosis')} onSubmit={() => post('diagnosis', { ...diagnosis, diagnosisFee: Number(diagnosis.diagnosisFee) })}>
              <Input label={t('service.problem')} value={diagnosis.problem} onChange={(value) => setDiagnosis({ ...diagnosis, problem: value })} />
              <Input label={t('service.diagnosisResult')} value={diagnosis.result} onChange={(value) => setDiagnosis({ ...diagnosis, result: value })} />
              <Input label={t('service.repair')} value={diagnosis.recommendedRepair} onChange={(value) => setDiagnosis({ ...diagnosis, recommendedRepair: value })} />
              <Input label={t('sales.paidAmount')} type="number" value={diagnosis.diagnosisFee} onChange={(value) => setDiagnosis({ ...diagnosis, diagnosisFee: value })} />
            </ActionForm>
            <ActionForm title={t('service.addRepair')} onSubmit={() => post('repairs', { ...repair, laborCost: Number(repair.laborCost) })}>
              <Input label={t('service.repair')} value={repair.description} onChange={(value) => setRepair({ ...repair, description: value })} />
              <Input label={t('service.laborCost')} type="number" value={repair.laborCost} onChange={(value) => setRepair({ ...repair, laborCost: value })} />
            </ActionForm>
            <ActionForm title={t('service.addUsedPart')} onSubmit={() => post('parts', { productId: part.productId, warehouseId: part.warehouseId, quantity: Number(part.quantity), unitPrice: part.unitPrice ? Number(part.unitPrice) : undefined })}>
              <Select label={t('sales.product')} value={part.productId} onChange={(value) => setPart({ ...part, productId: value })} options={products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }))} />
              <Select label={t('inventory.warehouse')} value={part.warehouseId} onChange={(value) => setPart({ ...part, warehouseId: value })} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
              <Input label={t('service.partsUsed')} type="number" value={part.quantity} onChange={(value) => setPart({ ...part, quantity: value })} />
              <Input label={t('distribution.unitPrice')} type="number" value={part.unitPrice} onChange={(value) => setPart({ ...part, unitPrice: value })} />
            </ActionForm>
          </div>
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">{t('service.completeOrder')}</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              <input value={warrantyUntil} onChange={(event) => setWarrantyUntil(event.target.value)} type="date" className="rounded-xl border border-slate-300 px-3 py-2" />
              <button onClick={() => void post('complete', { warrantyUntil: warrantyUntil ? new Date(warrantyUntil).toISOString() : undefined })} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">{t('service.completeOrder')}</button>
              <button onClick={() => void post('cancel', {})} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600" type="button">{t('service.cancelOrder')}</button>
            </div>
          </section>
          <History title={t('service.diagnosis')} rows={order.diagnoses ?? []} />
          <History title={t('service.repairs')} rows={order.repairs ?? []} />
          <History title={t('service.partsUsed')} rows={order.parts ?? []} />
          <History title={t('service.warranty')} rows={order.warranties ?? []} />
        </> : null}
      </section>
    </ProtectedShell>
  );
}

function ActionForm({ title, children, onSubmit }: { title: string; children: React.ReactNode; onSubmit: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(); }
  return <form onSubmit={submit} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">{title}</h3>{children}<button className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="submit">{title}</button></form>;
}
function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>; }
function History({ title, rows }: { title: string; rows: unknown[] }) { return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">{title}</h3><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-xs">{JSON.stringify(rows, null, 2)}</pre></section>; }
function formatKgs(value: number | string | null | undefined) { return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`; }
