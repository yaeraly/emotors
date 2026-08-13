import type { Language } from '@/i18n/translations';
import { installmentStatusLabelKey } from '@/lib/sale-installment';

export type StatusDomain =
  | 'procurement'
  | 'distribution'
  | 'payment'
  | 'warehouse'
  | 'employee'
  | 'branch'
  | 'branchRequest'
  | 'branchShortage'
  | 'branchRequestLine'
  | 'branchRequestIssue'
  | 'branchAccountant'
  | 'supplyInquiry'
  | 'supplyAbsenceReason'
  | 'service'
  | 'inventory'
  | 'inventoryCount'
  | 'general';

export type StatusModule =
  | StatusDomain
  | 'sale'
  | 'installment'
  | 'installmentApproval'
  | 'reservation'
  | 'return'
  | 'customer'
  | 'followUp'
  | 'paymentRecord'
  | 'stockMovement'
  | 'warranty'
  | 'repair'
  | 'finance'
  | 'invoice'
  | 'expense'
  | 'cashbox'
  | 'notification'
  | 'academy'
  | 'task'
  | 'pricing'
  | 'approval'
  | 'user'
  | 'employee'
  | 'purchaseOrder'
  | 'stockTransfer'
  | 'goodsReceiving'
  | 'shortageReport'
  | 'pickingTask'
  | 'chinaReceiving'
  | 'cargo'
  | 'branchOrder'
  | 'supplierOrder'
  | 'general';

const MODULE_DOMAIN_MAP: Partial<Record<StatusModule, StatusDomain>> = {
  sale: 'general',
  installment: 'general',
  installmentApproval: 'general',
  reservation: 'general',
  return: 'general',
  customer: 'general',
  followUp: 'general',
  paymentRecord: 'payment',
  stockMovement: 'warehouse',
  warranty: 'service',
  repair: 'service',
  finance: 'general',
  invoice: 'distribution',
  expense: 'general',
  cashbox: 'general',
  notification: 'general',
  academy: 'general',
  task: 'general',
  pricing: 'general',
  approval: 'general',
  user: 'employee',
  employee: 'employee',
  purchaseOrder: 'procurement',
  stockTransfer: 'warehouse',
  goodsReceiving: 'distribution',
  shortageReport: 'distribution',
  pickingTask: 'distribution',
  chinaReceiving: 'procurement',
  cargo: 'procurement',
  branchOrder: 'branchRequest',
  supplierOrder: 'procurement',
  inventoryCount: 'inventoryCount',
  inventory: 'inventory',
  service: 'service',
  procurement: 'procurement',
  distribution: 'distribution',
  payment: 'payment',
  warehouse: 'warehouse',
  branch: 'branch',
  branchRequest: 'branchRequest',
  branchShortage: 'branchShortage',
  branchRequestLine: 'branchRequestLine',
  branchRequestIssue: 'branchRequestIssue',
  branchAccountant: 'branchAccountant',
  supplyInquiry: 'supplyInquiry',
  supplyAbsenceReason: 'supplyAbsenceReason',
  general: 'general',
};

const MODULE_KEY_PREFIX: Partial<Record<StatusModule, string>> = {
  sale: 'sale.status',
  installment: 'installment.status',
  installmentApproval: 'installmentApproval.status',
  inventoryCount: 'inventoryCount.status',
  payment: 'paymentStatus',
  paymentRecord: 'paymentRecord.status',
  customer: 'status',
  followUp: 'followUp.status',
  user: 'status',
  employee: 'status',
  branch: 'branch.status',
  service: 'service.status',
  repair: 'repair.status',
  warranty: 'warranty.status',
  reservation: 'reservation.status',
  return: 'return.status',
  invoice: 'distribution.status',
  procurement: 'procurement.status',
  distribution: 'distribution.status',
  purchaseOrder: 'purchaseOrder.status',
  stockTransfer: 'stockTransfer.status',
  goodsReceiving: 'goodsReceiving.status',
  shortageReport: 'shortageReport.status',
  pickingTask: 'pickingTask.status',
  pricing: 'pricing.status',
  academy: 'academy.status',
  notification: 'notification.status',
  branchRequest: 'branchRequest.status',
  branchShortage: 'branchShortage.status',
  branchRequestLine: 'branchRequestLine.status',
  branchRequestIssue: 'branchRequestIssue.status',
  supplyInquiry: 'supplyInquiry.status',
  supplyAbsenceReason: 'supplyAbsenceReason.status',
  branchAccountant: 'branchAccountant.status',
  chinaReceiving: 'chinaReceiving.orderStatus',
};

function humanizeStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function resolveInstallmentApprovalLabel(
  t: (key: string) => string,
  status: string,
): string | null {
  const key = installmentStatusLabelKey(status as never);
  if (!key) return null;
  const translated = t(key);
  return translated !== key ? translated : null;
}

function buildCandidateKeys(module: StatusModule | undefined, status: string): string[] {
  const keys: string[] = [];

  if (module) {
    const prefix = MODULE_KEY_PREFIX[module];
    if (prefix) {
      keys.push(`${prefix}.${status}`);
    }

    const domain = MODULE_DOMAIN_MAP[module];
    if (domain && domain !== module) {
      keys.push(`${domain}.status.${status}`);
    }

    if (module === 'sale') {
      keys.push(`sale.status.${status}`);
    }
  }

  keys.push(`status.${status}`);
  return keys;
}

export function translateStatus(
  t: (key: string) => string,
  status: string | null | undefined,
  domain?: StatusDomain,
): string {
  return getStatusLabel({ module: domain, status, t });
}

type GetStatusLabelArgs = {
  module?: StatusModule;
  status: string | null | undefined;
  locale?: Language;
  t: (key: string) => string;
};

export function getStatusLabel({ module, status, t }: GetStatusLabelArgs): string {
  if (!status) return '-';
  const normalized = String(status).trim();
  if (!normalized) return '-';

  if (module === 'installmentApproval') {
    const installmentLabel = resolveInstallmentApprovalLabel(t, normalized);
    if (installmentLabel) return installmentLabel;
  }

  const candidates = buildCandidateKeys(module, normalized);
  for (const key of candidates) {
    const translated = t(key);
    if (translated !== key) return translated;
  }

  return humanizeStatus(normalized);
}

export function getStatusOptionLabel(
  module: StatusModule | undefined,
  status: string,
  t: (key: string) => string,
) {
  return getStatusLabel({ module, status, t });
}
