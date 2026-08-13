/** HQ Cashier procurement/import invoice types that use return-to-accountant, not payment failure. */
export const CASHIER_PROCUREMENT_IMPORT_REQUEST_TYPES = new Set([
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
]);

export function canCashierReportPaymentFailure(requestType: string): boolean {
  return !CASHIER_PROCUREMENT_IMPORT_REQUEST_TYPES.has(requestType);
}
