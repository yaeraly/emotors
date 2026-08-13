import { TransportExpenseType } from '@prisma/client';
import { roundMoneyDecimal } from './landed-cost-money.util';
import {
  resolveApprovedSupplierAmountKgs,
  isSupplierPaymentApprovedForLandedCost,
  sumConfirmedExpenseAmountKgs,
  sumSectionConfirmedExpenseAmountKgs,
  type SectionExpenseCostInput,
} from './procurement-cost.util';

export type ProcurementCostComponentKey =
  | 'SUPPLIER_PAYMENT'
  | 'CHINA_DOMESTIC_TRANSPORT'
  | 'CARGO_PAYMENT'
  | 'KYRGYZSTAN_DOMESTIC_TRANSPORT'
  | 'OTHER_IMPORT_EXPENSES';

export type ProcurementCostComponentReconciliation = {
  component: ProcurementCostComponentKey;
  displayName: string;
  sourceDocument: string;
  approvedAmountKgs: number;
  paidAmountKgs: number;
  includedInCostingKgs: number;
  allocationAmountKgs: number;
  allocationCount: number;
  duplicateExpenseRecords: number;
  expectedAmountKgs: number;
  actualAmountKgs: number;
  differenceKgs: number;
};

export type ProcurementLandedCostReconciliation = {
  components: ProcurementCostComponentReconciliation[];
  supplierKgs: number;
  chinaDomesticKgs: number;
  cargoKgs: number;
  kyrgyzstanKgs: number;
  otherImportKgs: number;
  expectedTotalKgs: number;
  actualTotalKgs: number;
  differenceKgs: number;
};

const COMPONENT_LABELS: Record<ProcurementCostComponentKey, string> = {
  SUPPLIER_PAYMENT: 'Supplier payment',
  CHINA_DOMESTIC_TRANSPORT: 'China Internal Transport',
  CARGO_PAYMENT: 'Cargo',
  KYRGYZSTAN_DOMESTIC_TRANSPORT: 'Kyrgyzstan Internal Transport',
  OTHER_IMPORT_EXPENSES: 'Other import expenses',
};

function countDuplicateApprovedExpenses(
  rows: SectionExpenseCostInput[],
  includedKgs: number,
  expectedKgs: number,
): number {
  const approved = rows.filter((row) => sumConfirmedExpenseAmountKgs([row], 1) > 0);
  if (approved.length <= 1) return 0;
  if (includedKgs + 0.009 < expectedKgs) return 0;
  return Math.max(0, approved.length - 1);
}

function sumPaidKgs(rows: Array<{ paidAmountKgs?: number | null }>) {
  return roundMoneyDecimal(
    rows.reduce((sum, row) => sum + Math.max(0, Number(row.paidAmountKgs ?? 0)), 0),
  );
}

export function buildProcurementLandedCostReconciliation(input: {
  estimatedYuanRate: number;
  supplier?: {
    invoiceSentToAccountantAt?: Date | string | null;
    supplierInvoiceNumber?: string | null;
    invoiceReviewStatus?: string | null;
    supplierPaymentStatus?: string | null;
    totalYuan?: number | null;
    requestedPaymentYuan?: number | null;
    totalPaidKgs?: number | null;
    estimatedSupplierCostKgs?: number | null;
  } | null;
  transportExpenses?: Array<SectionExpenseCostInput & { expenseType?: string }>;
  sectionBudgets?: Partial<
    Record<string, { totalAmount?: number | null; currency?: string | null }>
  >;
  logisticsIncluded?: {
    chinaDomesticTransportKgs?: number;
    chinaExportTransportKgs?: number;
    localTransportKgs?: number;
    customsCostKgs?: number;
    insuranceCostKgs?: number;
    bankFeeCostKgs?: number;
    otherExpenseKgs?: number;
  };
  allocationTotals?: Partial<Record<ProcurementCostComponentKey, { amountKgs: number; count: number }>>;
  expectedTotalKgs: number;
  actualTotalKgs: number;
}): ProcurementLandedCostReconciliation {
  const rate = Math.max(0, Number(input.estimatedYuanRate || 0));
  const expenses = input.transportExpenses ?? [];
  const budgets = input.sectionBudgets ?? {};
  const logistics = input.logisticsIncluded ?? {};
  const allocations = input.allocationTotals ?? {};

  const byType = (type: TransportExpenseType) =>
    expenses.filter((row) => String(row.expenseType) === type);

  const supplierApproved = isSupplierPaymentApprovedForLandedCost({
    invoiceSentToAccountantAt: input.supplier?.invoiceSentToAccountantAt,
    supplierInvoiceNumber: input.supplier?.supplierInvoiceNumber,
    invoiceReviewStatus: input.supplier?.invoiceReviewStatus,
    supplierPaymentStatus: input.supplier?.supplierPaymentStatus,
  });
  const supplierKgs = supplierApproved
    ? resolveApprovedSupplierAmountKgs({
        totalYuan: Number(input.supplier?.totalYuan ?? 0),
        requestedPaymentYuan:
          input.supplier?.requestedPaymentYuan != null
            ? Number(input.supplier.requestedPaymentYuan)
            : null,
        estimatedYuanRate: rate,
        estimatedSupplierCostKgs: input.supplier?.estimatedSupplierCostKgs,
      })
    : 0;

  const chinaRows = byType(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT);
  const chinaExpected = sumSectionConfirmedExpenseAmountKgs(chinaRows, rate, {
    sectionTotalAmount: budgets.DOMESTIC_CHINA_TRANSPORT?.totalAmount,
    sectionCurrency: budgets.DOMESTIC_CHINA_TRANSPORT?.currency ?? 'CNY',
  });
  const chinaRaw = sumConfirmedExpenseAmountKgs(chinaRows, rate);
  const chinaIncluded = Number(logistics.chinaDomesticTransportKgs ?? chinaExpected);

  const cargoRows = byType(TransportExpenseType.INTERNATIONAL_FREIGHT);
  const cargoExpected = sumSectionConfirmedExpenseAmountKgs(cargoRows, rate, {
    sectionTotalAmount: budgets.INTERNATIONAL_FREIGHT?.totalAmount,
    sectionCurrency: budgets.INTERNATIONAL_FREIGHT?.currency ?? 'KGS',
  });
  const cargoRaw = sumConfirmedExpenseAmountKgs(cargoRows, rate);
  const cargoIncluded = Number(logistics.chinaExportTransportKgs ?? cargoExpected);

  const kgRows = byType(TransportExpenseType.LOCAL_DELIVERY);
  const kgExpected = sumSectionConfirmedExpenseAmountKgs(kgRows, rate, {
    sectionTotalAmount: budgets.LOCAL_DELIVERY?.totalAmount,
    sectionCurrency: budgets.LOCAL_DELIVERY?.currency ?? 'KGS',
  });
  const kgRaw = sumConfirmedExpenseAmountKgs(kgRows, rate);
  const kgIncluded = Number(logistics.localTransportKgs ?? kgExpected);

  const otherRows = expenses.filter(
    (row) =>
      row.expenseType === TransportExpenseType.OTHER_LOGISTICS ||
      row.expenseType === TransportExpenseType.CHINA_WAREHOUSE ||
      row.expenseType === TransportExpenseType.CUSTOMS_BROKER,
  );
  const otherExpected = roundMoneyDecimal(
    sumSectionConfirmedExpenseAmountKgs(
      expenses.filter((row) => row.expenseType === TransportExpenseType.OTHER_LOGISTICS),
      rate,
      {
        sectionTotalAmount: budgets.OTHER_LOGISTICS?.totalAmount,
        sectionCurrency: 'KGS',
      },
    ) +
      sumSectionConfirmedExpenseAmountKgs(
        expenses.filter((row) => row.expenseType === TransportExpenseType.CUSTOMS_BROKER),
        rate,
        {
          sectionTotalAmount: budgets.CUSTOMS_BROKER?.totalAmount,
          sectionCurrency: 'KGS',
        },
      ),
  );
  const otherIncluded = roundMoneyDecimal(
    Number(logistics.customsCostKgs ?? 0) +
      Number(logistics.insuranceCostKgs ?? 0) +
      Number(logistics.bankFeeCostKgs ?? 0) +
      Number(logistics.otherExpenseKgs ?? 0),
  );

  function componentRow(
    key: ProcurementCostComponentKey,
    sourceDocument: string,
    approved: number,
    paid: number,
    included: number,
    expected: number,
    raw: number,
    expenseRows: SectionExpenseCostInput[],
  ): ProcurementCostComponentReconciliation {
    const alloc = allocations[key];
    return {
      component: key,
      displayName: COMPONENT_LABELS[key],
      sourceDocument,
      approvedAmountKgs: approved,
      paidAmountKgs: paid,
      includedInCostingKgs: included,
      allocationAmountKgs: alloc?.amountKgs ?? included,
      allocationCount: alloc?.count ?? 0,
      duplicateExpenseRecords: countDuplicateApprovedExpenses(expenseRows, raw, expected),
      expectedAmountKgs: expected,
      actualAmountKgs: included,
      differenceKgs: roundMoneyDecimal(included - expected),
    };
  }

  const components = [
    componentRow(
      'SUPPLIER_PAYMENT',
      input.supplier?.supplierInvoiceNumber ?? 'supplier invoice',
      supplierKgs,
      Number(input.supplier?.totalPaidKgs ?? 0),
      supplierKgs,
      supplierKgs,
      supplierKgs,
      [],
    ),
    componentRow(
      'CHINA_DOMESTIC_TRANSPORT',
      'DOMESTIC_CHINA_TRANSPORT expense',
      chinaExpected,
      sumPaidKgs(chinaRows),
      chinaIncluded,
      chinaExpected,
      chinaRaw,
      chinaRows,
    ),
    componentRow(
      'CARGO_PAYMENT',
      'INTERNATIONAL_FREIGHT expense',
      cargoExpected,
      sumPaidKgs(cargoRows),
      cargoIncluded,
      cargoExpected,
      cargoRaw,
      cargoRows,
    ),
    componentRow(
      'KYRGYZSTAN_DOMESTIC_TRANSPORT',
      'LOCAL_DELIVERY expense',
      kgExpected,
      sumPaidKgs(kgRows),
      kgIncluded,
      kgExpected,
      kgRaw,
      kgRows,
    ),
    componentRow(
      'OTHER_IMPORT_EXPENSES',
      'customs / insurance / bank / other',
      otherExpected,
      sumPaidKgs(otherRows),
      otherIncluded,
      otherExpected,
      sumConfirmedExpenseAmountKgs(otherRows, rate),
      otherRows,
    ),
  ];

  const expectedTotalKgs = roundMoneyDecimal(input.expectedTotalKgs);
  const actualTotalKgs = roundMoneyDecimal(input.actualTotalKgs);

  return {
    components,
    supplierKgs,
    chinaDomesticKgs: chinaIncluded,
    cargoKgs: cargoIncluded,
    kyrgyzstanKgs: kgIncluded,
    otherImportKgs: otherIncluded,
    expectedTotalKgs,
    actualTotalKgs,
    differenceKgs: roundMoneyDecimal(actualTotalKgs - expectedTotalKgs),
  };
}
