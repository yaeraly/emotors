'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ServiceProductSearch } from '@/components/ServiceProductSearch';
import { apiFetch } from '@/lib/api';
import { hasPermission, isBranchMasterUser, isBranchWarehouseOperator } from '@/lib/rbac';
import type { PaymentMethod, ServiceOrder, ServiceProductOption, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

export default function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [error, setError] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partNotes, setPartNotes] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ServiceProductOption | null>(null);
  const [repair, setRepair] = useState({ description: '', laborCost: '0' });
  const [diagnosis, setDiagnosis] = useState({ problem: '', result: '', recommendedRepair: '', diagnosisFee: '0' });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [receiptText, setReceiptText] = useState('');

  const isMaster = isBranchMasterUser(user);
  const isWarehouse = isBranchWarehouseOperator(user);
  const isCashier = hasPermission(user, 'payments.manage') && !isMaster;

  const load = useCallback(async () => {
    const orderResult = await apiFetch<ServiceOrder>(`/service-orders/${id}`);
    setOrder(orderResult);
    const receipt = await apiFetch<{ text: string }>(`/service-orders/${id}/receipt`);
    setReceiptText(receipt.text);
  }, [id]);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [load, t]);

  async function post(path: string, payload?: unknown) {
    setError('');
    try {
      await apiFetch(`/service-orders/${id}/${path}`, {
        method: 'POST',
        body: payload ? JSON.stringify(payload) : undefined,
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function put(path: string, payload: unknown) {
    setError('');
    try {
      await apiFetch(`/service-orders/${id}/${path}`, { method: 'PUT', body: JSON.stringify(payload) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function requestParts(event: FormEvent) {
    event.preventDefault();
    if (!selectedProduct) return;
    setError('');
    try {
      const request = await apiFetch(`/service-orders/${id}/parts-requests`, {
        method: 'POST',
        body: JSON.stringify({
          items: [{ productId: selectedProduct.id, quantity: Number(partQty), notes: partNotes || undefined }],
        }),
      });
      await apiFetch(`/service-orders/${id}/parts-requests/${(request as { id: string }).id}/submit`, { method: 'POST' });
      setSelectedProduct(null);
      setPartQty('1');
      setPartNotes('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function uploadPhoto(type: 'BEFORE' | 'AFTER' | 'DAMAGED_PART', file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      await post('photos', {
        type,
        fileName: file.name,
        fileUrl: reader.result,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  }

  const checklistComplete = order
    ? order.checklistDiagnostics &&
      order.checklistPartsInstalled &&
      order.checklistTestDrive &&
      order.checklistFinalInspection &&
      order.checklistCustomerInformed
    : false;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{order?.orderNumber ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {order ? (
          <>
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
              <Info label={t('service.customer')} value={order.customer?.fullName ?? ''} />
              <Info label={t('service.master')} value={order.master?.fullName ?? ''} />
              <Info label={t('service.status')} value={translateStatus(t, order.status, 'service')} />
              <Info label={t('service.totalAmount')} value={formatKgs(order.totalAmount)} />
              <Info label="Транспорт" value={order.vehicle ?? '-'} />
              <Info label="Гос. номер" value={order.licensePlate ?? '-'} />
              <Info label={t('service.laborCost')} value={formatKgs(order.laborCost)} />
              <Info label={t('service.partsCost')} value={formatKgs(order.partsCost)} />
              <Info label={t('sales.paidAmount')} value={formatKgs(order.paidAmount)} />
              <Info label={t('sales.debtAmount')} value={formatKgs(order.debtAmount)} />
              <Info label={t('service.warranty')} value={order.warrantyUntil ? new Date(order.warrantyUntil).toLocaleDateString('ru-RU') : '-'} />
            </section>

            {isMaster && !['PAID', 'COMPLETED', 'CANCELLED'].includes(order.status) ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <ActionForm title={t('service.addDiagnosis')} onSubmit={() => post('diagnosis', { ...diagnosis, diagnosisFee: Number(diagnosis.diagnosisFee) })}>
                  <Input label={t('service.problem')} value={diagnosis.problem} onChange={(v) => setDiagnosis({ ...diagnosis, problem: v })} />
                  <Input label={t('service.diagnosisResult')} value={diagnosis.result} onChange={(v) => setDiagnosis({ ...diagnosis, result: v })} />
                  <Input label={t('service.repair')} value={diagnosis.recommendedRepair} onChange={(v) => setDiagnosis({ ...diagnosis, recommendedRepair: v })} />
                  <Input label={t('service.laborCost')} type="number" value={diagnosis.diagnosisFee} onChange={(v) => setDiagnosis({ ...diagnosis, diagnosisFee: v })} />
                </ActionForm>
                <ActionForm title={t('service.addRepair')} onSubmit={() => post('repairs', { ...repair, laborCost: Number(repair.laborCost) })}>
                  <Input label={t('service.repair')} value={repair.description} onChange={(v) => setRepair({ ...repair, description: v })} />
                  <Input label={t('service.laborCost')} type="number" value={repair.laborCost} onChange={(v) => setRepair({ ...repair, laborCost: v })} />
                </ActionForm>
                <form onSubmit={requestParts} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold">Запрос запчастей</h3>
                  <ServiceProductSearch onSelect={setSelectedProduct} />
                  {selectedProduct ? <p className="text-sm text-slate-600">{selectedProduct.name} · {selectedProduct.unitPrice.toLocaleString('ru-RU')} KGS</p> : null}
                  <Input label={t('inventory.quantity')} type="number" value={partQty} onChange={setPartQty} />
                  <Input label={t('common.notes')} value={partNotes} onChange={setPartNotes} />
                  <button className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="submit">Отправить на склад</button>
                </form>
              </div>
            ) : null}

            {isMaster ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">Чек-лист ремонта</h3>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {([
                    ['checklistDiagnostics', 'Диагностика завершена'],
                    ['checklistPartsInstalled', 'Запчасти установлены'],
                    ['checklistTestDrive', 'Тест-драйв выполнен'],
                    ['checklistFinalInspection', 'Финальная проверка'],
                    ['checklistCustomerInformed', 'Клиент проинформирован'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(order[key])}
                        onChange={(e) => void put('checklist', { [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(order.oldPartReturned)}
                      onChange={(e) => void put('checklist', { oldPartReturned: e.target.checked })}
                    />
                    Старая деталь возвращена клиенту
                  </label>
                </div>
              </section>
            ) : null}

            {isMaster ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">Фото</h3>
                <div className="mt-4 flex flex-wrap gap-4">
                  {(['BEFORE', 'AFTER', 'DAMAGED_PART'] as const).map((type) => (
                    <label key={type} className="cursor-pointer rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold">
                      {type === 'BEFORE' ? 'До ремонта' : type === 'AFTER' ? 'После ремонта' : 'Повреждённые детали'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(type, f); }} />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {order.photos?.map((photo) => (
                    <img key={photo.id} src={photo.fileUrl} alt={photo.fileName} className="h-24 w-24 rounded-lg object-cover" />
                  ))}
                </div>
              </section>
            ) : null}

            {isMaster && !['READY_FOR_PAYMENT', 'PAID', 'COMPLETED'].includes(order.status) ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <button onClick={() => void post('ready-for-payment')} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white" type="button">
                  Отправить на оплату
                </button>
              </section>
            ) : null}

            {isCashier && ['READY_FOR_PAYMENT', 'PAID'].includes(order.status) && order.debtAmount > 0 ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">Оплата</h3>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label>
                    <span className="text-sm font-semibold">Способ оплаты</span>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="mt-2 block rounded-xl border px-3 py-2">
                      <option value="CASH">Наличные</option>
                      <option value="QR">QR</option>
                      <option value="CARD">Банковская карта</option>
                      <option value="MIXED">Смешанная</option>
                    </select>
                  </label>
                  <button
                    onClick={() => void post('payment', { method: paymentMethod, amount: order.debtAmount })}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white"
                    type="button"
                  >
                    Принять оплату {formatKgs(order.debtAmount)}
                  </button>
                </div>
              </section>
            ) : null}

            {isMaster && order.status === 'PAID' ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <button
                  disabled={!checklistComplete}
                  onClick={() => void post('complete', {})}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  type="button"
                >
                  {t('service.completeOrder')}
                </button>
                {!checklistComplete ? <p className="mt-2 text-sm text-amber-700">Завершите чек-лист перед закрытием заказа</p> : null}
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Чек</h3>
                <button onClick={() => window.print()} className="rounded-xl border px-3 py-2 text-sm font-semibold" type="button">Печать</button>
              </div>
              <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 font-mono text-sm">{receiptText}</pre>
            </section>

            <History title={t('service.diagnosis')} rows={order.diagnoses ?? []} />
            <History title={t('service.repairs')} rows={order.repairs ?? []} />
            <History title={t('service.partsUsed')} rows={order.parts ?? []} />
            <History title="Запросы запчастей" rows={order.partsRequests ?? []} />
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function ActionForm({ title, children, onSubmit }: { title: string; children: React.ReactNode; onSubmit: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(); }
  return <form onSubmit={submit} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">{title}</h3>{children}<button className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="submit">{title}</button></form>;
}
function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} type={type} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>; }
function History({ title, rows }: { title: string; rows: unknown[] }) { return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">{title}</h3><pre className="mt-4 max-h-60 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-xs">{JSON.stringify(rows, null, 2)}</pre></section>; }
function formatKgs(value: number | string | null | undefined) { return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`; }
