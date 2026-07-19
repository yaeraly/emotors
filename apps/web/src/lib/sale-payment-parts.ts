import type { PaymentMethod } from './types';

export type PaymentPartRow = {
  id: string;
  method: PaymentMethod | '';
  amount: string;
  cashReceived: string;
  note: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createPaymentPartRow(
  partial?: Partial<Pick<PaymentPartRow, 'method' | 'amount' | 'cashReceived' | 'note'>>,
): PaymentPartRow {
  return {
    id: crypto.randomUUID(),
    method: partial?.method ?? '',
    amount: partial?.amount ?? '',
    cashReceived: partial?.cashReceived ?? '',
    note: partial?.note ?? '',
  };
}

export function sumPaymentParts(rows: PaymentPartRow[]) {
  return roundMoney(
    rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
}

export function availableMethodsForRow(
  rows: PaymentPartRow[],
  rowIndex: number,
  allMethods: readonly PaymentMethod[],
) {
  const used = new Set(
    rows
      .map((row, index) => (index === rowIndex ? null : row.method))
      .filter((method): method is PaymentMethod => Boolean(method)),
  );
  return allMethods.filter((method) => !used.has(method));
}

export function cashChangeForRow(row: PaymentPartRow) {
  if (row.method !== 'CASH') return 0;
  const applied = Number(row.amount || 0);
  const received = Number(row.cashReceived || 0);
  if (!received) return 0;
  return roundMoney(Math.max(received - applied, 0));
}

export function validatePaymentParts(
  rows: PaymentPartRow[],
  saleTotal: number,
): { ok: true } | { ok: false; messageKey: string } {
  if (!rows.length) {
    return { ok: false, messageKey: 'sales.paymentMethodRequired' };
  }

  for (const row of rows) {
    if (!row.method) {
      return { ok: false, messageKey: 'sales.paymentMethodRequired' };
    }
    const amount = Number(row.amount || 0);
    if (!row.amount.trim()) {
      return { ok: false, messageKey: 'sales.paymentAmountRequired' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, messageKey: 'sales.paymentAmountPositive' };
    }
    if (row.method !== 'CASH') {
      const otherNonCash = roundMoney(
        rows
          .filter((part) => part.method && part.method !== 'CASH')
          .reduce((sum, part) => sum + Number(part.amount || 0), 0),
      );
      const cashApplied = roundMoney(
        rows
          .filter((part) => part.method === 'CASH')
          .reduce((sum, part) => sum + Number(part.amount || 0), 0),
      );
      const nonCashCap = roundMoney(Math.max(saleTotal - cashApplied, 0));
      if (otherNonCash > nonCashCap + 0.009) {
        return { ok: false, messageKey: 'sales.nonCashOverpayment' };
      }
    }
    if (row.method === 'CASH') {
      const received = Number(row.cashReceived || 0);
      if (received > 0 && received + 0.009 < amount) {
        return { ok: false, messageKey: 'sales.cashReceivedTooLow' };
      }
    }
  }

  const methods = rows.map((row) => row.method).filter(Boolean);
  if (new Set(methods).size !== methods.length) {
    return { ok: false, messageKey: 'sales.duplicatePaymentMethod' };
  }

  const paidTotal = sumPaymentParts(rows);
  if (paidTotal > saleTotal + 0.009) {
    return { ok: false, messageKey: 'sales.nonCashOverpayment' };
  }

  return { ok: true };
}
