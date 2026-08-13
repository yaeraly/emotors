import {
  FullPaymentBonusTrigger,
  InstallmentBonusTrigger,
  SalesMotivationBonusType,
} from '@prisma/client';

export type PlanLevelInput = { salesThreshold: number; bonusAmount: number };
export type AverageReceiptLevelInput = { averageReceiptThreshold: number; bonusAmount: number };

export type SalesMotivationDefaults = {
  fullPaymentCommissionPercent: number;
  fullPaymentMinCommission: number;
  fullPaymentMaxCommission: number | null;
  fullPaymentTrigger: FullPaymentBonusTrigger;
  installmentApprovalCommissionPercent: number;
  installmentRepaymentCommissionPercent: number;
  installmentTrigger: InstallmentBonusTrigger;
  returningCustomerDays: number;
  returningCustomerBonusType: SalesMotivationBonusType;
  returningCustomerFixedAmount: number | null;
  returningCustomerPercent: number | null;
  averageReceiptMinCount: number;
  planLevels: PlanLevelInput[];
  averageReceiptLevels: AverageReceiptLevelInput[];
};

export const EMOTORS_DEFAULT_MOTIVATION: SalesMotivationDefaults = {
  fullPaymentCommissionPercent: 0.8,
  fullPaymentMinCommission: 0,
  fullPaymentMaxCommission: null,
  fullPaymentTrigger: FullPaymentBonusTrigger.AFTER_CASHIER_PAYMENT_CONFIRMATION,
  installmentApprovalCommissionPercent: 0.3,
  installmentRepaymentCommissionPercent: 0.5,
  installmentTrigger: InstallmentBonusTrigger.AFTER_FULL_REPAYMENT,
  returningCustomerDays: 30,
  returningCustomerBonusType: SalesMotivationBonusType.FIXED,
  returningCustomerFixedAmount: 150,
  returningCustomerPercent: null,
  averageReceiptMinCount: 30,
  planLevels: [
    { salesThreshold: 500_000, bonusAmount: 5_000 },
    { salesThreshold: 800_000, bonusAmount: 10_000 },
    { salesThreshold: 1_200_000, bonusAmount: 20_000 },
    { salesThreshold: 1_500_000, bonusAmount: 30_000 },
    { salesThreshold: 2_000_000, bonusAmount: 50_000 },
  ],
  averageReceiptLevels: [
    { averageReceiptThreshold: 12_000, bonusAmount: 2_000 },
    { averageReceiptThreshold: 15_000, bonusAmount: 5_000 },
    { averageReceiptThreshold: 18_000, bonusAmount: 8_000 },
  ],
};

export type BranchSalesStats = {
  monthsAnalyzed: number;
  completedSalesCount: number;
  monthlySalesAverage: number;
  averageReceipt: number;
  installmentSharePercent: number;
  repeatCustomerRatePercent: number;
  sufficient: boolean;
};

export function buildSmartRecommendations(stats: BranchSalesStats) {
  const source = stats.sufficient ? 'BRANCH_STATISTICS' : 'EMOTORS_DEFAULT';
  const base = { ...EMOTORS_DEFAULT_MOTIVATION };

  if (!stats.sufficient) {
    return {
      source,
      values: base,
      reasons: defaultReasons(),
    };
  }

  const scale = Math.max(0.6, Math.min(1.8, stats.monthlySalesAverage / 1_000_000 || 1));
  const planLevels = EMOTORS_DEFAULT_MOTIVATION.planLevels.map((level) => ({
    salesThreshold: Math.round(level.salesThreshold * scale),
    bonusAmount: Math.round(level.bonusAmount * Math.max(0.7, Math.min(1.5, scale))),
  }));

  const avg = stats.averageReceipt > 0 ? stats.averageReceipt : 12_000;
  const averageReceiptLevels = [
    { averageReceiptThreshold: Math.round(avg * 0.9), bonusAmount: 2_000 },
    { averageReceiptThreshold: Math.round(avg * 1.1), bonusAmount: 5_000 },
    { averageReceiptThreshold: Math.round(avg * 1.3), bonusAmount: 8_000 },
  ];

  const fullPaymentCommissionPercent =
    stats.installmentSharePercent > 50 ? 0.9 : stats.installmentSharePercent < 20 ? 0.7 : 0.8;

  return {
    source,
    values: {
      ...base,
      fullPaymentCommissionPercent,
      planLevels,
      averageReceiptLevels,
      averageReceiptMinCount: Math.max(20, Math.min(40, Math.round(stats.completedSalesCount / Math.max(stats.monthsAnalyzed, 1) / 4))),
      returningCustomerDays: stats.repeatCustomerRatePercent > 25 ? 45 : 30,
    },
    reasons: {
      fullPayment: `Рекомендуется ${fullPaymentCommissionPercent}%, так как филиал получает деньги сразу при полной оплате.`,
      installment: '0.3% после одобрения + 0.5% после полного погашения — риск ниже после полной оплаты рассрочки.',
      plan: 'Пороги плана рассчитаны по среднему объёму продаж филиала за последние месяцы.',
      averageReceipt: `${base.averageReceiptMinCount} чеков рекомендуется, чтобы исключить бонус по нескольким случайным крупным продажам.`,
      returningCustomer: '30 дней — клиент, вернувшийся спустя этот срок, считается повторным покупателем.',
    },
  };
}

function defaultReasons() {
  return {
    fullPayment: 'Рекомендуется 0.8%, так как филиал получает деньги сразу.',
    installment: '0.3% + 0.5% — риск ниже после полного погашения рассрочки.',
    plan: 'Стандартные уровни EMOTORS для ежемесячного плана продаж.',
    averageReceipt: '30 чеков рекомендуется, чтобы исключить бонус по нескольким случайным крупным продажам.',
    returningCustomer: '30 дней — клиент, вернувшийся спустя этот срок, считается повторным покупателем.',
  };
}

export function estimateMonthlyBonusImpact(input: {
  monthlySalesAverage: number;
  fullPaymentShare: number;
  installmentShare: number;
  values: SalesMotivationDefaults;
}) {
  const fullPaymentSales = input.monthlySalesAverage * (input.fullPaymentShare / 100);
  const installmentSales = input.monthlySalesAverage * (input.installmentShare / 100);
  const fullPaymentCommission =
    (fullPaymentSales * input.values.fullPaymentCommissionPercent) / 100;
  const installmentCommission =
    (installmentSales *
      (input.values.installmentApprovalCommissionPercent +
        input.values.installmentRepaymentCommissionPercent)) /
    100;

  const matchedPlan = [...input.values.planLevels]
    .sort((a, b) => b.salesThreshold - a.salesThreshold)
    .find((level) => input.monthlySalesAverage >= level.salesThreshold);
  const planBonus = matchedPlan?.bonusAmount ?? 0;

  const matchedAvg = [...input.values.averageReceiptLevels]
    .sort((a, b) => b.averageReceiptThreshold - a.averageReceiptThreshold)[0];
  const averageReceiptBonus = matchedAvg?.bonusAmount ?? 0;

  const returningBonus =
    input.values.returningCustomerBonusType === SalesMotivationBonusType.FIXED
      ? Number(input.values.returningCustomerFixedAmount ?? 0) * 10
      : (input.monthlySalesAverage * Number(input.values.returningCustomerPercent ?? 0)) / 100;

  const total =
    Math.round(
      (fullPaymentCommission +
        installmentCommission +
        planBonus +
        averageReceiptBonus +
        returningBonus +
        Number.EPSILON) *
        100,
    ) / 100;

  return {
    estimatedMonthlyBonusExpenseKgs: total,
    breakdown: {
      fullPaymentCommission: Math.round(fullPaymentCommission * 100) / 100,
      installmentCommission: Math.round(installmentCommission * 100) / 100,
      planBonus,
      averageReceiptBonus,
      returningBonus: Math.round(returningBonus * 100) / 100,
    },
  };
}
