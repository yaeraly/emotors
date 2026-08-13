export const BUSINESS_DATE_ENTITY_TYPES = [
  'Sale',
  'Payment',
  'InstallmentSchedule',
  'ProcurementOrder',
  'ProcurementSupplierPayment',
  'ProcurementTransportExpense',
  'ProcurementGoodsReceiving',
  'GoodsReceiving',
  'BranchInvoice',
  'BranchPayment',
  'FinanceExpense',
  'FinanceTransfer',
  'FinanceInvestment',
  'FifoInventoryBatch',
  'HqB2bPaymentRequest',
] as const;

export type BusinessDateEntityType = (typeof BUSINESS_DATE_ENTITY_TYPES)[number];

export type BusinessDateFieldConfig = {
  fieldName: string;
  labelRu: string;
};

export type BusinessDateEntityConfig = {
  prismaModel: string;
  fields: BusinessDateFieldConfig[];
  /** Prisma field name for branch id when present. */
  branchIdField?: string;
};

export const BUSINESS_DATE_ENTITY_REGISTRY: Record<BusinessDateEntityType, BusinessDateEntityConfig> = {
  Sale: {
    prismaModel: 'sale',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'saleDate', labelRu: 'Дата продажи' }],
  },
  Payment: {
    prismaModel: 'payment',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'paidAt', labelRu: 'Дата оплаты' }],
  },
  InstallmentSchedule: {
    prismaModel: 'installmentSchedule',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'dueDate', labelRu: 'Дата платежа' }],
  },
  ProcurementOrder: {
    prismaModel: 'procurementOrder',
    fields: [
      { fieldName: 'purchaseDate', labelRu: 'Дата закупки' },
      { fieldName: 'shippedAt', labelRu: 'Дата отгрузки' },
      { fieldName: 'arrivedAt', labelRu: 'Дата прибытия' },
      { fieldName: 'actualArrivalDate', labelRu: 'Фактическая дата прибытия' },
      { fieldName: 'receivedToHqAt', labelRu: 'Дата получения на HQ' },
    ],
  },
  ProcurementSupplierPayment: {
    prismaModel: 'procurementSupplierPayment',
    fields: [{ fieldName: 'paymentDate', labelRu: 'Дата оплаты поставщику' }],
  },
  ProcurementTransportExpense: {
    prismaModel: 'procurementTransportExpense',
    fields: [
      { fieldName: 'invoiceDate', labelRu: 'Дата счёта' },
      { fieldName: 'paidAt', labelRu: 'Дата оплаты' },
    ],
  },
  ProcurementGoodsReceiving: {
    prismaModel: 'procurementGoodsReceiving',
    fields: [{ fieldName: 'receivedAt', labelRu: 'Дата получения' }],
  },
  GoodsReceiving: {
    prismaModel: 'goodsReceiving',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'receivedAt', labelRu: 'Дата получения' }],
  },
  BranchInvoice: {
    prismaModel: 'branchInvoice',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'issuedAt', labelRu: 'Дата счёта' }],
  },
  BranchPayment: {
    prismaModel: 'branchPayment',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'paidAt', labelRu: 'Дата оплаты' }],
  },
  FinanceExpense: {
    prismaModel: 'financeExpense',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'expenseDate', labelRu: 'Дата расхода' }],
  },
  FinanceTransfer: {
    prismaModel: 'financeTransfer',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'transferDate', labelRu: 'Дата перевода' }],
  },
  FinanceInvestment: {
    prismaModel: 'financeInvestment',
    branchIdField: 'branchId',
    fields: [{ fieldName: 'investmentDate', labelRu: 'Дата инвестиции' }],
  },
  FifoInventoryBatch: {
    prismaModel: 'fifoInventoryBatch',
    fields: [{ fieldName: 'receivedAt', labelRu: 'Дата движения склада' }],
  },
  HqB2bPaymentRequest: {
    prismaModel: 'hqB2bPaymentRequest',
    fields: [{ fieldName: 'paymentDate', labelRu: 'Дата оплаты' }],
  },
};

export function resolveBusinessDateEntityConfig(
  entityType: string,
  fieldName: string,
): BusinessDateEntityConfig & { fieldName: string } {
  const config = BUSINESS_DATE_ENTITY_REGISTRY[entityType as BusinessDateEntityType];
  if (!config) {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }
  const field = config.fields.find((f) => f.fieldName === fieldName);
  if (!field) {
    throw new Error(`Unsupported field ${fieldName} for entity ${entityType}`);
  }
  return { ...config, fieldName: field.fieldName };
}

export function isSupportedBusinessDateEntity(entityType: string, fieldName: string): boolean {
  const config = BUSINESS_DATE_ENTITY_REGISTRY[entityType as BusinessDateEntityType];
  if (!config) return false;
  return config.fields.some((f) => f.fieldName === fieldName);
}
