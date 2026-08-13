import type { PaymentMethod } from './types';

export type PaymentPartRow = {
  id: string;
  method: PaymentMethod | '';
  amount: string;
  cashReceived: string;
  note: string;
};

export type PaymentAllocation = {
  nonCashTotal: number;
  cashRequired: number;
  cashApplied: number;
  cashReceived: number;
  changeAmount: number;
  appliedTotal: number;
  remainingAmount: number;
  cashShortage: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createPaymentPartRow(
  partial?: Partial<Pick<PaymentPartRow, 'method' | 'amount' | 'cashReceived' | 'note'>>,
): PaymentPartRow {
  return {
    id: crypto.randomUUID(),
    method: partial?.method ?? 'CASH',
    amount: partial?.amount ?? '',
    cashReceived: partial?.cashReceived ?? '',
    note: partial?.note ?? '',
  };
}

export function computePaymentAllocation(
  rows: PaymentPartRow[],
  saleTotal: number,
): PaymentAllocation {
  const nonCashTotal = roundMoney(
    rows
      .filter((row) => row.method && row.method !== 'CASH')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );

  const cashRow = rows.find((row) => row.method === 'CASH');
  const cashReceived = cashRow ? Number(cashRow.cashReceived || 0) : 0;
  const cashRequired = roundMoney(Math.max(saleTotal - nonCashTotal, 0));
  const cashApplied = cashRow ? roundMoney(Math.min(cashReceived, cashRequired)) : 0;
  const changeAmount = cashRow
    ? roundMoney(Math.max(cashReceived - cashRequired, 0))
    : 0;
  const appliedTotal = roundMoney(nonCashTotal + cashApplied);
  const remainingAmount = roundMoney(Math.max(saleTotal - appliedTotal, 0));
  const cashShortage =
    cashRow && cashRequired > 0
      ? roundMoney(Math.max(cashRequired - cashReceived, 0))
      : remainingAmount;

  return {
    nonCashTotal,
    cashRequired,
    cashApplied,
    cashReceived,
    changeAmount,
    appliedTotal,
    remainingAmount,
    cashShortage,
  };
}

export function sumPaymentParts(rows: PaymentPartRow[], saleTotal: number) {
  return computePaymentAllocation(rows, saleTotal).appliedTotal;
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

export function cashChangeForRow(row: PaymentPartRow, saleTotal: number, rows: PaymentPartRow[]) {
  if (row.method !== 'CASH') return 0;
  return computePaymentAllocation(rows, saleTotal).changeAmount;
}

export function buildPaymentPayloads(rows: PaymentPartRow[], saleTotal: number) {
  const allocation = computePaymentAllocation(rows, saleTotal);

  return rows
    .map((row) => {
      if (!row.method) return null;

      if (row.method === 'CASH') {
        if (allocation.cashApplied <= 0 && allocation.cashReceived <= 0) {
          return null;
        }

        return {
          method: row.method,
          amount: allocation.cashApplied,
          cashReceived: allocation.cashReceived > 0 ? allocation.cashReceived : undefined,
          changeAmount: allocation.changeAmount > 0 ? allocation.changeAmount : undefined,
          note: row.note.trim() || undefined,
        };
      }

      const amount = Number(row.amount || 0);
      if (amount <= 0) return null;

      return {
        method: row.method,
        amount,
        note: row.note.trim() || undefined,
      };
    })
    .filter((payload): payload is NonNullable<typeof payload> => Boolean(payload))
    .sort((left, right) => {
      if (left.method === 'CASH') return 1;
      if (right.method === 'CASH') return -1;
      return 0;
    });
}

export function validatePaymentParts(
  rows: PaymentPartRow[],
  saleTotal: number,
): { ok: true } | { ok: false; messageKey: string; amount?: number } {
  if (!rows.length) {
    return { ok: false, messageKey: 'sales.paymentMethodRequired' };
  }

  const methods = rows.map((row) => row.method).filter(Boolean);
  if (new Set(methods).size !== methods.length) {
    return { ok: false, messageKey: 'sales.duplicatePaymentMethod' };
  }

  const allocation = computePaymentAllocation(rows, saleTotal);

  for (const row of rows) {
    if (!row.method) {
      return { ok: false, messageKey: 'sales.paymentMethodRequired' };
    }

    if (row.method === 'CASH') {
      if (allocation.cashRequired <= 0) {
        continue;
      }
      const received = Number(row.cashReceived || 0);
      if (!row.cashReceived.trim()) {
        return { ok: false, messageKey: 'sales.cashReceivedRequired' };
      }
      if (!Number.isFinite(received) || received < 0) {
        return { ok: false, messageKey: 'sales.cashReceivedRequired' };
      }
      continue;
    }

    const amount = Number(row.amount || 0);
    if (!row.amount.trim()) {
      return { ok: false, messageKey: 'sales.paymentAmountRequired' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, messageKey: 'sales.paymentAmountPositive' };
    }
  }

  if (allocation.nonCashTotal > saleTotal + 0.009) {
    return { ok: false, messageKey: 'sales.nonCashOverpayment' };
  }

  const cashRow = rows.find((row) => row.method === 'CASH');
  if (cashRow && allocation.cashRequired > 0 && allocation.cashShortage > 0.009) {
    return {
      ok: false,
      messageKey: 'sales.insufficientCash',
      amount: allocation.cashShortage,
    };
  }

  if (!cashRow && allocation.remainingAmount > 0.009) {
    return {
      ok: false,
      messageKey: 'sales.insufficientCash',
      amount: allocation.remainingAmount,
    };
  }

  if (allocation.appliedTotal > saleTotal + 0.009) {
    return { ok: false, messageKey: 'sales.nonCashOverpayment' };
  }

  return { ok: true };
}

export function isPaymentComplete(rows: PaymentPartRow[], saleTotal: number) {
  if (saleTotal <= 0) return false;
  const validation = validatePaymentParts(rows, saleTotal);
  if (!validation.ok) return false;
  const allocation = computePaymentAllocation(rows, saleTotal);
  return Math.abs(allocation.appliedTotal - saleTotal) <= 0.009;
}
