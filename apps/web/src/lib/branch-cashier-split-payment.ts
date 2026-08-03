export const BRANCH_SPLIT_PAYMENT_ERRORS = {
  NO_METHOD_AMOUNT: 'Введите сумму хотя бы для одного способа оплаты.',
  FULL_PAYMENT_UNDER: 'Общая сумма платежа меньше суммы полной оплаты.',
  INSTALLMENT_OVER: 'Сумма погашения превышает остаток рассрочки.',
  QR_OVER_PAYABLE: 'Сумма QR-оплаты не может превышать сумму к оплате.',
} as const;

export type SplitPaymentPreview = {
  cashGrossAmount: number;
  qrGrossAmount: number;
  cashNetAmount: number;
  qrNetAmount: number;
  cashChangeAmount: number;
  totalEntered: number;
  totalNetAmount: number;
  remainingAfterPayment: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseSplitAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return roundMoney(parsed);
}

export function previewSplitCashierPayment(input: {
  payableAmount: number;
  isFullPayment: boolean;
  cashAmount: string;
  qrAmount: string;
}): SplitPaymentPreview | { error: string } {
  const payableAmount = roundMoney(input.payableAmount);
  const cashGrossAmount = parseSplitAmount(input.cashAmount);
  const qrGrossAmount = parseSplitAmount(input.qrAmount);
  const totalEntered = roundMoney(cashGrossAmount + qrGrossAmount);

  if (cashGrossAmount <= 0 && qrGrossAmount <= 0) {
    return { error: BRANCH_SPLIT_PAYMENT_ERRORS.NO_METHOD_AMOUNT };
  }

  if (qrGrossAmount > payableAmount + 0.009) {
    return { error: BRANCH_SPLIT_PAYMENT_ERRORS.QR_OVER_PAYABLE };
  }

  const qrNetAmount = qrGrossAmount;
  const remainingAfterQr = roundMoney(Math.max(payableAmount - qrNetAmount, 0));

  let cashChangeAmount = 0;
  let cashNetAmount = 0;

  if (input.isFullPayment) {
    if (totalEntered + 0.009 < payableAmount) {
      return { error: BRANCH_SPLIT_PAYMENT_ERRORS.FULL_PAYMENT_UNDER };
    }
    cashChangeAmount = roundMoney(Math.max(cashGrossAmount - remainingAfterQr, 0));
    cashNetAmount = roundMoney(cashGrossAmount - cashChangeAmount);
  } else {
    if (totalEntered > payableAmount + 0.009) {
      cashNetAmount = roundMoney(Math.max(payableAmount - qrNetAmount, 0));
      cashChangeAmount = roundMoney(Math.max(cashGrossAmount - cashNetAmount, 0));
    } else {
      cashNetAmount = cashGrossAmount;
    }
    const totalNetAmount = roundMoney(cashNetAmount + qrNetAmount);
    if (totalNetAmount > payableAmount + 0.009) {
      return { error: BRANCH_SPLIT_PAYMENT_ERRORS.INSTALLMENT_OVER };
    }
  }

  const totalNetAmount = roundMoney(cashNetAmount + qrNetAmount);
  const remainingAfterPayment = roundMoney(Math.max(payableAmount - totalNetAmount, 0));

  if (input.isFullPayment && Math.abs(totalNetAmount - payableAmount) > 0.009) {
    return { error: BRANCH_SPLIT_PAYMENT_ERRORS.FULL_PAYMENT_UNDER };
  }

  return {
    cashGrossAmount,
    qrGrossAmount,
    cashNetAmount,
    qrNetAmount,
    cashChangeAmount,
    totalEntered,
    totalNetAmount,
    remainingAfterPayment,
  };
}

export function computeSplitRemaining(payableAmount: number, totalEntered: number) {
  return roundMoney(Math.max(payableAmount - totalEntered, 0));
}
