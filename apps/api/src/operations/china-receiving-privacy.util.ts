import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';

export function isWarehouseManagerOnlyView(user: AuthUser) {
  const roles = resolveUserRoles(user);
  return roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles) && !roles.includes(Role.SUPPLY_CHAIN_MANAGER);
}

const WM_HIDDEN_DETAIL_FIELDS = [
  'supplier',
  'factory',
  'supplierId',
  'factoryId',
  'defaultYuanRate',
  'totalYuan',
  'totalCostKgs',
  'totalTransportCostKgs',
  'chinaDomesticTransportYuan',
  'chinaDomesticTransportKgs',
  'chinaExportTransportKgs',
  'localTransportKgs',
  'customsCostKgs',
  'insuranceCostKgs',
  'bankFeeCostKgs',
  'otherExpenseKgs',
  'packagingCostKgs',
  'cargoTotalWeightKg',
  'cargoRateUsdPerKg',
  'cargoReceiptNumber',
  'cargoReceiptDate',
  'cargoReceiptNote',
  'supplierPayments',
  'svhToHqTransport',
  'differenceReports',
] as const;

export function sanitizeChinaReceivingListTask<T extends Record<string, unknown>>(
  task: T,
  wmView: boolean,
): T {
  if (!wmView) return task;
  const { supplier, factory, validation, ...rest } = task as T & {
    supplier?: unknown;
    factory?: unknown;
    validation?: unknown;
  };
  return {
    ...rest,
    validation: validation
      ? {
          canReceiveToHq: (validation as { canReceiveToHq?: boolean }).canReceiveToHq,
          invoicePrerequisites: (validation as { invoicePrerequisites?: unknown }).invoicePrerequisites,
        }
      : undefined,
  } as unknown as T;
}

export function sanitizeChinaReceivingDetail<T extends Record<string, unknown>>(
  detail: T,
  wmView: boolean,
): T {
  if (!wmView) return detail;
  const sanitized = { ...detail } as Record<string, unknown>;
  for (const field of WM_HIDDEN_DETAIL_FIELDS) {
    delete sanitized[field];
  }
  if (Array.isArray(sanitized.lineItems)) {
    sanitized.lineItems = (sanitized.lineItems as Array<Record<string, unknown>>).map((item) => {
      const { orderedQuantity, purchasePriceYuan, ...lineRest } = item;
      return lineRest;
    });
  }
  if (Array.isArray(sanitized.shipmentBatches)) {
    sanitized.shipmentBatches = (sanitized.shipmentBatches as Array<Record<string, unknown>>).map((batch) => ({
      id: batch.id,
      batchId: batch.batchId,
      shipmentBatchId: batch.shipmentBatchId,
      receivingNumber: batch.receivingNumber,
      receivedAt: batch.receivedAt,
      items: batch.items,
      discrepancyActs: Array.isArray(batch.discrepancyActs)
        ? (batch.discrepancyActs as Array<Record<string, unknown>>).map((act) => ({
            id: act.id,
            actNumber: act.actNumber,
            batchId: act.batchId,
            productName: act.productName,
            sku: act.sku,
            expectedQty: act.expectedQty,
            actualQty: act.actualQty,
            differenceQty: act.differenceQty,
            differenceType: act.differenceType,
            status: act.status,
          }))
        : [],
    }));
  }
  if (sanitized.documents && typeof sanitized.documents === 'object') {
    const docs = sanitized.documents as Record<string, unknown>;
    sanitized.documents = {
      photos: docs.photos,
      discrepancyActs: Array.isArray(docs.discrepancyActs)
        ? (docs.discrepancyActs as Array<Record<string, unknown>>).map((act) => ({
            id: act.id,
            actNumber: act.actNumber,
            differenceType: act.differenceType,
            status: act.status,
          }))
        : [],
    };
  }
  return sanitized as T;
}
