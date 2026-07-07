'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canManageBranchPurchaseRequests,
  canManageOwnBranchProductRequest,
  canViewBranchPurchaseRequests,
} from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type RequestDetail = {
  id: string;
  requestNumber: string;
  branchId: string;
  branchWarehouseId?: string | null;
  assignedHqWarehouseId?: string | null;
  assignedHqWarehouse?: { id: string; name: string; code?: string } | null;
  branch?: {
    id: string;
    name: string;
    assignedHqWarehouse?: { id: string; name: string; code?: string } | null;
  };
  status: string;
  note?: string | null;
  transportCompany?: string | null;
  transportCostKgs?: number;
  driverName?: string | null;
  vehicleNumber?: string | null;
  dispatchDate?: string | null;
  transportNotes?: string | null;
  totalQuantity?: number;
  totalEstimatedAmount?: number;
  convertedOrderId?: string | null;
  createdAt: string;
  createdBy?: { id: string; fullName: string; role: string };
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    approvedQuantity?: number | null;
    unit: string;
    currentBranchStock: number;
    hqAvailableStock?: number | null;
    wholesalePriceKgs: number;
    transportExpenseAllocation: number;
    estimatedUnitCost: number;
    totalAmount: number;
    weightKg: number;
    note?: string | null;
  }>;
};

function isSubmittedStatus(status: string) {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}

export default function BranchPurchaseRequestDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function localizeBranchRequestError(message: string) {
    if (message.includes('NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH')) return t('branchHqRouting.noWarehouseAssigned');
    if (message.includes('INACTIVE_HQ_WAREHOUSE')) return t('branchHqRouting.inactiveWarehouse');
    if (message.includes('NO_HQ_WAREHOUSE_MANAGER_ASSIGNED')) return t('branchHqRouting.noWarehouseManager');
    return message;
  }

  async function load() {
    const [detail, me, branchList, bwList] = await Promise.all([
      apiFetch<RequestDetail>(`/branch-purchase-requests/${params.id}`),
      apiFetch<User>('/auth/me'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=BRANCH&status=ACTIVE'),
    ]);
    setRequest(detail);
    setUser(me);
    setBranches(branchList);
    setWarehouses(bwList);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [params.id, t]);

  async function review(action: 'approve' | 'reject') {
    if (!request) return;
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${request.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSuccess(action === 'approve' ? t('distribution.orderApproved') : t('distribution.orderRejected'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function sendToHqWarehouse() {
    if (!request) return;
    setError('');
    try {
      const order = await apiFetch<{ id: string }>(`/branch-purchase-requests/${request.id}/send-to-hq-warehouse`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSuccess(t('branchHqRouting.sentToWarehouse'));
      window.location.href = `/distribution/orders/${order.id}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(localizeBranchRequestError(message));
    }
  }

  const canManage = canManageBranchPurchaseRequests(user);
  const canCreate = canManageOwnBranchProductRequest(user);
  const canView = canViewBranchPurchaseRequests(user);

  if (user && !canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  if (!request) {
    return (
      <ProtectedShell>
        <p className="text-slate-600">{t('common.loading')}</p>
      </ProtectedShell>
    );
  }

  const branchName = request.branch?.name ?? branches.find((branch) => branch.id === request.branchId)?.name ?? request.branchId;
  const assignedHqWarehouseName =
    request.assignedHqWarehouse?.name ??
    request.branch?.assignedHqWarehouse?.name ??
    branches.find((branch) => branch.id === request.branchId)?.assignedHqWarehouse?.name ??
    '-';
  const branchWarehouseName =
    warehouses.find((warehouse) => warehouse.id === request.branchWarehouseId)?.name ?? request.branchWarehouseId ?? '-';

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/branch-purchase-requests" className="text-sm font-semibold text-blue-600">
              ← {t('operations.branchPurchaseRequests')}
            </Link>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{request.requestNumber}</h2>
            <p className="mt-1 text-sm text-slate-500">{translateStatus(t, request.status)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && isSubmittedStatus(request.status) ? (
              <>
                <button type="button" onClick={() => void review('approve')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  {t('distribution.approve')}
                </button>
                <button type="button" onClick={() => void review('reject')} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">
                  {t('distribution.reject')}
                </button>
              </>
            ) : null}
            {canManage && (request.status === 'APPROVED' || request.status === 'CONFIRMED') ? (
              <button type="button" onClick={() => void sendToHqWarehouse()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                {t('branchHqRouting.sendToWarehouseManager')}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('distribution.branch')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branchName}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.branchWarehouse')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branchWarehouseName}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.requestedBy')}</p>
            <p className="mt-1 font-semibold text-slate-900">{request.createdBy?.fullName ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchHqRouting.assignedHqWarehouse')}</p>
            <p className="mt-1 font-semibold text-slate-900">{assignedHqWarehouseName}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.requestDate')}</p>
            <p className="mt-1 font-semibold text-slate-900">{new Date(request.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.totalQuantity')}</p>
            <p className="mt-1 font-semibold text-slate-900">{request.totalQuantity ?? request.items.reduce((sum, item) => sum + item.quantity, 0)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.estimatedAmount')}</p>
            <p className="mt-1 font-semibold text-slate-900">{Number(request.totalEstimatedAmount ?? 0).toFixed(2)} KGS</p>
          </div>
          {request.note ? (
            <div className="md:col-span-3">
              <p className="text-xs font-bold uppercase text-slate-400">{t('crm.notes')}</p>
              <p className="mt-1 text-slate-700">{request.note}</p>
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.product')}</th>
                <th className="px-4 py-3">{t('distribution.quantity')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.unit')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.branchStock')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.hqStock')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.wholesalePrice')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.transportAllocation')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.estimatedUnitCost')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.totalAmount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {request.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.sku}</p>
                  </td>
                  <td className="px-4 py-3">{item.approvedQuantity ?? item.quantity}</td>
                  <td className="px-4 py-3">{item.unit}</td>
                  <td className="px-4 py-3">{item.currentBranchStock}</td>
                  <td className="px-4 py-3">{item.hqAvailableStock ?? '-'}</td>
                  <td className="px-4 py-3">{Number(item.wholesalePriceKgs).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(item.transportExpenseAllocation).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(item.estimatedUnitCost).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(item.totalAmount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(request.transportCompany || Number(request.transportCostKgs) > 0) && canCreate ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('branchProductRequest.transportSection')}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <p><span className="font-semibold">{t('branchProductRequest.transportCompany')}:</span> {request.transportCompany ?? '-'}</p>
              <p><span className="font-semibold">{t('branchProductRequest.transportCostKgs')}:</span> {Number(request.transportCostKgs ?? 0).toFixed(2)}</p>
              <p><span className="font-semibold">{t('branchProductRequest.driverName')}:</span> {request.driverName ?? '-'}</p>
              <p><span className="font-semibold">{t('branchProductRequest.vehicleNumber')}:</span> {request.vehicleNumber ?? '-'}</p>
              <p><span className="font-semibold">{t('branchProductRequest.dispatchDate')}:</span> {request.dispatchDate ? new Date(request.dispatchDate).toLocaleDateString() : '-'}</p>
              {request.transportNotes ? (
                <p className="md:col-span-2"><span className="font-semibold">{t('branchProductRequest.transportNotes')}:</span> {request.transportNotes}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
