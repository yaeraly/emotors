export function usesCargoQrPaymentForm(expenseType: string): boolean {
  return expenseType === 'INTERNATIONAL_FREIGHT';
}

export function buildCargoSectionUpdatePayload(input: {
  transportCompanyId?: string;
  supplierCarrier: string;
  expenseName?: string;
  recipientName?: string;
  totalWeightKg: number;
  cargoRateUsdPerKg: number;
  usdExchangeRate: number;
}): Record<string, unknown> {
  return {
    transportCompanyId: input.transportCompanyId,
    supplierCarrier: input.supplierCarrier,
    expenseName: input.expenseName || undefined,
    recipientName: input.recipientName || undefined,
    paymentMethod: 'QR_CODE',
    totalWeightKg: input.totalWeightKg,
    cargoRateUsdPerKg: input.cargoRateUsdPerKg,
    usdExchangeRate: input.usdExchangeRate,
  };
}

export function buildCargoSectionCreatePayload(
  input: {
    procurementOrderId: string;
    expenseType: string;
    requestType: string;
    transportCompanyId?: string;
    supplierCarrier: string;
    expenseName?: string;
    recipientName?: string;
    totalWeightKg: number;
    cargoRateUsdPerKg: number;
    usdExchangeRate: number;
    calculatedAmountUsd: number;
    calculatedAmountKgs: number;
  },
): Record<string, unknown> {
  return {
    procurementOrderId: input.procurementOrderId,
    expenseType: input.expenseType,
    requestType: input.requestType,
    transportCompanyId: input.transportCompanyId,
    supplierCarrier: input.supplierCarrier,
    expenseName: input.expenseName || undefined,
    recipientName: input.recipientName || undefined,
    currency: 'KGS',
    paymentMethod: 'QR_CODE',
    totalWeightKg: input.totalWeightKg,
    cargoRateUsdPerKg: input.cargoRateUsdPerKg,
    usdExchangeRate: input.usdExchangeRate,
    calculatedAmountUsd: input.calculatedAmountUsd,
    calculatedAmountKgs: input.calculatedAmountKgs,
    amount: input.calculatedAmountKgs,
  };
}
