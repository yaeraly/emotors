import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ProcurementCostConfirmationStatus,
  ProcurementLandedCostStatus,
  ProcurementOrderItemStatus,
  ProcurementItemWeightStatus,
  StockMovementType,
  TransportExpenseStatus,
  TransportExpenseType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { pricesFromMarkups } from '../pricing/pricing-calculator.util';
import { DEFAULT_EXPENSE_ALLOCATION } from './landed-cost-allocation.util';
import {
  buildLogisticsWithCargo,
  calculateLandedCosts,
  CARGO_WEIGHT_LESS_THAN_NET,
  extractCargoConfig,
  extractLogisticsCosts,
  LandedCostOrderResult,
  mapStoredProcurementItemToLandedCostInput,
} from './landed-cost.util';
import {
  estimateSectionExpenseCostKgs,
  estimateSupplierCostKgs,
  expensesFullySettled,
  resolveProcurementCostConfirmationStatus,
  sumConfirmedExpenseAmountKgs,
} from './procurement-cost.util';
import { resolveProcurementLogisticsInput } from './transport-logistics.util';
import { summarizeSupplierPayments } from './supplier-payment.util';
import { resolveMovementCostUpdates } from './landed-cost-sync-movements.util';
import { resolveUnitCostFromInventoryLayer } from '../pricing/pricing-fifo-unit-cost.util';

export type RecalculateProcurementOrderOptions = {
  reason?: string;
  triggerReason?: string;
  useDraftQuantities?: boolean;
  user?: AuthUser;
  finalize?: boolean;
  /** When true, recalculate item/order costs even after HQ receive (FINALIZED). */
  allowAfterFinalize?: boolean;
};

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class LandedCostService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculateProcurementOrder(
    procurementOrderId: string,
    options: RecalculateProcurementOrderOptions = {},
    tx?: TxClient,
  ) {
    const run = async (client: TxClient) => {
      const order = await client.procurementOrder.findFirst({
        where: { id: procurementOrderId, deletedAt: null },
        include: {
          items: { where: { status: ProcurementOrderItemStatus.ACTIVE }, orderBy: { createdAt: 'asc' } },
          supplierPayments: true,
          transportExpenses: true,
          svhToHqTransport: { include: { transportCompany: true } },
          chinaReceivingDraftRows: { where: { isArchived: false } },
          landedCostSnapshots: true,
        },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      const alreadyReceived = Boolean(order.hqStockMovementCreatedAt);
      const allowAfterFinalize = options.allowAfterFinalize || options.finalize || alreadyReceived;
      if (
        order.landedCostStatus === ProcurementLandedCostStatus.FINALIZED &&
        !allowAfterFinalize
      ) {
        return { order, calculated: null, skipped: true };
      }

      const previousSnapshots = order.landedCostSnapshots;
      const previousTotalCostKgs = Number(order.totalCostKgs ?? 0);
      const paymentInputs = (order.supplierPayments ?? []).map((payment) => ({
        amountYuan: Number(payment.amountYuan),
        exchangeRate: Number(payment.exchangeRate),
        amountKgs: Number(payment.amountKgs),
        actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
        approvedAmountKgs: payment.approvedAmountKgs != null ? Number(payment.approvedAmountKgs) : null,
        status: payment.status,
      }));
      const summary = summarizeSupplierPayments(paymentInputs, Number(order.totalYuan), {
        invoiceSentToAccountantAt: (order as any).invoiceSentToAccountantAt,
      });

      // Cost always values the FULL procurement CNY amount (not only paid CNY).
      const supplierCost = estimateSupplierCostKgs({
        totalProcurementYuan: Number(order.totalYuan),
        payments: paymentInputs,
        estimatedYuanRate: Number(order.defaultYuanRate),
      });
      const effectiveRate = supplierCost.costYuanRate;

      const expenseRows = (order.transportExpenses ?? []).map((expense) => ({
        amount: Number(expense.amount),
        currency: expense.currency,
        exchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
        amountKgs: Number(expense.amountKgs),
        paidAmountKgs: (expense as { paidAmountKgs?: unknown }).paidAmountKgs != null
          ? Number((expense as { paidAmountKgs?: unknown }).paidAmountKgs)
          : null,
        status: expense.status,
        expenseType: expense.expenseType,
      }));

      const chinaExpenses = expenseRows.filter(
        (row) => row.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
      );
      const cargoExpenses = expenseRows.filter(
        (row) => row.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT,
      );
      const kgExpenses = expenseRows.filter(
        (row) => row.expenseType === TransportExpenseType.LOCAL_DELIVERY,
      );
      const otherExpenses = expenseRows.filter(
        (row) =>
          row.expenseType === TransportExpenseType.OTHER_LOGISTICS ||
          row.expenseType === TransportExpenseType.CHINA_WAREHOUSE,
      );
      const customsBrokerExpenses = expenseRows.filter(
        (row) => row.expenseType === TransportExpenseType.CUSTOMS_BROKER,
      );

      // Payment-progress estimates (full section) — used for confirmation status only.
      const chinaSection = estimateSectionExpenseCostKgs({
        expenses: chinaExpenses,
        sectionTotalAmount: Number(order.chinaDomesticTransportYuan || 0),
        estimatedYuanRate: effectiveRate,
        defaultCurrency: 'CNY',
      });
      const cargoSection = estimateSectionExpenseCostKgs({
        expenses: cargoExpenses,
        sectionTotalAmount: Number(order.totalCargoCostKgs || 0),
        estimatedYuanRate: effectiveRate,
        defaultCurrency: 'KGS',
      });
      const kgSection = estimateSectionExpenseCostKgs({
        expenses: kgExpenses,
        sectionTotalAmount: Number(order.localTransportKgs || order.svhToHqTransport?.transportCostKgs || 0),
        estimatedYuanRate: effectiveRate,
        defaultCurrency: 'KGS',
      });
      const otherSection = estimateSectionExpenseCostKgs({
        expenses: otherExpenses,
        sectionTotalAmount: Number(order.otherExpenseKgs || 0),
        estimatedYuanRate: effectiveRate,
        defaultCurrency: 'KGS',
      });

      // Inventory landed cost: confirmed expenses + saved import-cost scalars (exactly once per bucket).
      const confirmedChinaKgs = sumConfirmedExpenseAmountKgs(chinaExpenses, effectiveRate);
      const confirmedCargoKgs = sumConfirmedExpenseAmountKgs(cargoExpenses, effectiveRate);
      const confirmedLocalKgs = sumConfirmedExpenseAmountKgs(kgExpenses, effectiveRate);
      const confirmedOtherKgs = sumConfirmedExpenseAmountKgs(otherExpenses, effectiveRate);
      const confirmedCustomsBrokerKgs = sumConfirmedExpenseAmountKgs(
        customsBrokerExpenses,
        effectiveRate,
      );

      const orderForLogistics = {
        ...order,
        chinaDomesticTransportKgs: Math.max(
          confirmedChinaKgs,
          Number(order.chinaDomesticTransportKgs || 0),
        ),
        chinaExportTransportKgs: Math.max(
          confirmedCargoKgs,
          Number(order.chinaExportTransportKgs || 0),
          Number(order.totalCargoCostKgs || 0),
        ),
        localTransportKgs: Math.max(
          confirmedLocalKgs,
          Number(order.localTransportKgs || 0),
        ),
        otherExpenseKgs: Math.max(confirmedOtherKgs, Number(order.otherExpenseKgs || 0)),
        customsCostKgs: Math.max(
          confirmedCustomsBrokerKgs,
          Number(order.customsCostKgs || 0),
        ),
      };

      const expensesHaveCompletedPayments = expenseRows.some(
        (row) => row.status === TransportExpenseStatus.PAID,
      );
      const expensesFullyPaid = expensesFullySettled(
        expenseRows,
        [
          chinaSection.sectionTotalAmount,
          cargoSection.sectionTotalAmount,
          kgSection.sectionTotalAmount,
          otherSection.sectionTotalAmount,
        ],
      );
      const costConfirmationStatus = resolveProcurementCostConfirmationStatus({
        supplierFullyPaid: supplierCost.isFullyPaid,
        supplierHasCompletedPayments: supplierCost.completedPaidYuan > 0,
        expensesFullyPaid,
        expensesHaveCompletedPayments,
      }) as ProcurementCostConfirmationStatus;

      const resolved = resolveProcurementLogisticsInput(orderForLogistics, orderForLogistics, effectiveRate);
      // Re-apply confirmed expense floors after yuan→KGS resolution so CNY order fields cannot
      // wipe a higher confirmed paid expense amount.
      resolved.logistics.chinaDomesticTransportKgs = Math.max(
        Number(resolved.logistics.chinaDomesticTransportKgs || 0),
        confirmedChinaKgs,
      );
      resolved.logistics.chinaExportTransportKgs = Math.max(
        Number(resolved.logistics.chinaExportTransportKgs || 0),
        confirmedCargoKgs,
        Number(order.totalCargoCostKgs || 0),
      );
      resolved.logistics.localTransportKgs = Math.max(
        Number(resolved.logistics.localTransportKgs || 0),
        confirmedLocalKgs,
      );
      resolved.logistics.otherExpenseKgs = Math.max(
        Number(resolved.logistics.otherExpenseKgs || 0),
        confirmedOtherKgs,
      );
      resolved.logistics.customsCostKgs = Math.max(
        Number(resolved.logistics.customsCostKgs || 0),
        confirmedCustomsBrokerKgs,
      );
      const { logistics, cargo, ...transportResolved } = resolved;

      const draftMap = new Map(
        (order.chinaReceivingDraftRows ?? [])
          .filter((row) => row.isSaved)
          .map((row) => [row.procurementItemId, row]),
      );

      const itemInputs = order.items.map((item) => {
        const draft = options.useDraftQuantities ? draftMap.get(item.id) : undefined;
        const receivedQuantity = draft?.actualQuantity ?? item.receivedQuantity ?? undefined;
        const unitWeightKg = draft?.unitWeightKg ?? item.unitWeightKg;
        const weightStatus = draft?.weightStatus ?? item.weightStatus;
        return mapStoredProcurementItemToLandedCostInput({
          ...item,
          receivedQuantity,
          unitWeightKg,
          weightStatus,
          yuanRate: effectiveRate,
        });
      });

      let calculated: LandedCostOrderResult;
      try {
        calculated = calculateLandedCosts(itemInputs, logistics, { cargo });
      } catch (error) {
        if (options.user) {
          await client.auditLog.create({
            data: {
              userId: options.user.id,
              role: options.user.role,
              action: 'LANDED_COST_CALCULATION_FAILED',
              entity: 'ProcurementOrder',
              entityId: order.id,
              metadata: {
                userId: options.user.id,
                procurementOrderId: order.id,
                triggerReason: options.triggerReason ?? options.reason ?? 'recalculate',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
              },
            },
          });
        }
        if (error instanceof Error && error.message === CARGO_WEIGHT_LESS_THAN_NET) {
          throw new BadRequestException('Cargo total weight cannot be less than product net weight.');
        }
        throw error;
      }

      const cargoTotalWeightKg = Number(cargo.cargoTotalWeightKg ?? 0);
      const { logistics: resolvedLogistics } = buildLogisticsWithCargo(logistics, cargoTotalWeightKg, cargo);
      const { localTransportKgs: _local, ...logisticsTotals } = resolvedLogistics;
      const nextVersion = (order.landedCostCalculationVersion ?? 0) + 1;

      const landedCostStatus = alreadyReceived
        ? ProcurementLandedCostStatus.FINALIZED
        : calculated.pendingWeight
          ? ProcurementLandedCostStatus.PENDING_WEIGHT
          : calculated.landedCostStatus === 'CALCULATED'
            ? ProcurementLandedCostStatus.CALCULATED
            : ProcurementLandedCostStatus.READY_TO_CALCULATE;

      for (const [index, item] of order.items.entries()) {
        const next = calculated.items[index];
        await client.procurementOrderItem.update({
          where: { id: item.id },
          data: {
            yuanRate: effectiveRate,
            costKgs: next.costKgs,
            weightKg: next.hasKnownWeight ? next.netWeightKg : item.weightKg,
            netWeightKg: next.hasKnownWeight ? next.netWeightKg : 0,
            packagingWeightKg: next.packagingWeightKg ?? 0,
            totalWeightKg: next.lineShipmentWeightKg ?? next.totalWeightKg,
            chinaDomesticAllocKgs: next.chinaDomesticAllocKgs,
            chinaExportAllocKgs: next.chinaExportAllocKgs,
            localTransportAllocKgs: next.localTransportAllocKgs,
            packagingAllocKgs: next.packagingAllocKgs,
            customsAllocKgs: next.customsAllocKgs,
            insuranceAllocKgs: next.insuranceAllocKgs,
            bankFeeAllocKgs: next.bankFeeAllocKgs,
            otherAllocKgs: next.otherAllocKgs,
            transportCostKgs: next.transportCostKgs,
            finalCostKgs: next.finalCostKgs,
            totalYuan: next.totalYuan,
            totalCostKgs: next.totalCostKgs,
          },
        });
      }

      const persistedCargoKgs = Math.max(
        confirmedCargoKgs,
        Number(resolvedLogistics.chinaExportTransportKgs || 0),
        Number(calculated.totalCargoCostKgs || 0),
      );

      const updatedOrder = await client.procurementOrder.update({
        where: { id: order.id },
        data: {
          ...logisticsTotals,
          otherExpenseKgs: Number(resolvedLogistics.otherExpenseKgs || 0),
          customsCostKgs: Number(resolvedLogistics.customsCostKgs || 0),
          defaultUsdRate: cargo.usdRate,
          cargoRateUsdPerKg: cargo.cargoRateUsdPerKg,
          cargoTotalWeightKg,
          totalCargoCostUsd: calculated.totalCargoCostUsd,
          totalCargoCostKgs: persistedCargoKgs,
          totalNetWeightKg: calculated.totalNetWeightKg,
          totalPackagingWeightKg: calculated.totalPackagingWeightKg,
          totalYuan: calculated.totalYuan,
          totalTransportCostKgs: calculated.totalTransportCostKgs,
          totalCostKgs: calculated.totalCostKgs,
          totalWeightKg: calculated.totalShipmentWeightKg,
          costPerKg: calculated.costPerKg,
          chinaExportTransportKgs: persistedCargoKgs,
          localTransportKgs: transportResolved.localTransportKgs,
          landedCostStatus,
          costConfirmationStatus,
          estimatedSupplierCostKgs: supplierCost.estimatedSupplierCostKgs,
          landedCostCalculationVersion: nextVersion,
          landedCostCalculatedAt: new Date(),
          totalPaidYuan: summary.totalPaidYuan,
          totalPaidKgs: summary.totalPaidKgs,
          remainingYuan: summary.remainingYuan,
          weightedAverageYuanRate:
            supplierCost.isFullyPaid && supplierCost.finalWeightedAverageRate != null
              ? supplierCost.finalWeightedAverageRate
              : summary.weightedAverageYuanRate,
          supplierPaymentStatus: summary.supplierPaymentStatus,
        },
        include: {
          items: { where: { status: ProcurementOrderItemStatus.ACTIVE }, orderBy: { createdAt: 'asc' } },
          landedCostSnapshots: true,
        },
      });

      for (const [index, item] of order.items.entries()) {
        const next = calculated.items[index];
        const draft = draftMap.get(item.id);
        const actualQty =
          draft?.actualQuantity ??
          (item.receivedQuantity != null ? item.receivedQuantity : item.quantity);
        const snapshotData = {
          procurementOrderId: order.id,
          procurementOrderItemId: item.id,
          productId: item.productId,
          actualQty,
          unitWeightKg: next.hasKnownWeight ? next.netWeightKg : null,
          totalWeightKg: next.lineShipmentWeightKg ?? 0,
          basePurchaseCostKgs: next.basePurchaseCostKgs,
          allocatedChinaTransportKgs: next.chinaDomesticAllocKgs,
          allocatedCargoKgs: next.chinaExportAllocKgs,
          allocatedKyrgyzstanTransportKgs: next.localTransportAllocKgs,
          allocatedInsuranceKgs: next.insuranceAllocKgs,
          allocatedCustomsKgs: next.customsAllocKgs,
          allocatedTransportExpensesKgs: next.bankFeeAllocKgs,
          allocatedPackagingKgs: next.packagingAllocKgs,
          allocatedOtherExpensesKgs: next.otherAllocKgs,
          totalLandedCostKgs: next.totalCostKgs,
          unitLandedCostKgs: next.finalCostKgs,
          calculationVersion: nextVersion,
          isFinalized: alreadyReceived,
          isProvisional: calculated.isProvisional && !alreadyReceived,
          calculatedAt: new Date(),
        };
        await client.procurementLandedCostSnapshot.upsert({
          where: { procurementOrderItemId: item.id },
          create: snapshotData,
          update: snapshotData,
        });
      }

      if (alreadyReceived) {
        await this.syncReceivedInventoryCosts(client, options.user, order, calculated);
      }

      if (
        alreadyReceived &&
        options.user &&
        Math.abs(previousTotalCostKgs - Number(calculated.totalCostKgs)) > 0.009
      ) {
        await client.procurementCostAdjustment.create({
          data: {
            procurementOrderId: order.id,
            oldTotalCostKgs: previousTotalCostKgs,
            newTotalCostKgs: calculated.totalCostKgs,
            oldWeightedRate: order.weightedAverageYuanRate
              ? Number(order.weightedAverageYuanRate)
              : null,
            newWeightedRate: supplierCost.costYuanRate,
            reason: options.triggerReason ?? options.reason ?? 'import-expense-recalc',
            createdById: options.user.id,
          },
        });
      }

      if (options.user) {
        const auditAction = calculated.pendingWeight
          ? 'LANDED_COST_PENDING_WEIGHT'
          : 'LANDED_COST_RECALCULATED';
        const costAuditPayload = {
          userId: options.user.id,
          procurementOrderId: order.id,
          triggerReason: options.triggerReason ?? options.reason ?? 'recalculate',
          calculationVersion: nextVersion,
          landedCostStatus,
          costConfirmationStatus,
          isProvisional: calculated.isProvisional,
          oldSnapshotCount: previousSnapshots.length,
          // Full procurement amount remains the supplier cost base.
          totalProcurementYuan: supplierCost.totalProcurementYuan,
          completedPaidYuan: supplierCost.completedPaidYuan,
          remainingYuan: supplierCost.remainingYuan,
          costYuanRate: supplierCost.costYuanRate,
          rateSource: supplierCost.rateSource,
          estimatedSupplierCostKgs: supplierCost.estimatedSupplierCostKgs,
          estimatedYuanRate: Number(order.defaultYuanRate),
          timestamp: new Date().toISOString(),
        };
        await client.auditLog.create({
          data: {
            userId: options.user.id,
            role: options.user.role,
            action: auditAction,
            entity: 'ProcurementOrder',
            entityId: order.id,
            metadata: costAuditPayload,
          },
        });
        await client.auditLog.create({
          data: {
            userId: options.user.id,
            role: options.user.role,
            action: 'PROCUREMENT_COST_RECALCULATED',
            entity: 'ProcurementOrder',
            entityId: order.id,
            metadata: {
              ...costAuditPayload,
              oldEstimatedSupplierCostKgs: Number(order.estimatedSupplierCostKgs ?? 0),
              oldCostConfirmationStatus: order.costConfirmationStatus,
            },
          },
        });
        if (options.triggerReason) {
          await client.auditLog.create({
            data: {
              userId: options.user.id,
              role: options.user.role,
              action: 'COST_REALLOCATION_TRIGGERED',
              entity: 'ProcurementOrder',
              entityId: order.id,
              metadata: {
                userId: options.user.id,
                procurementOrderId: order.id,
                triggerReason: options.triggerReason,
                calculationVersion: nextVersion,
                costConfirmationStatus,
                timestamp: new Date().toISOString(),
              },
            },
          });
        }
      }

      return { order: updatedOrder, calculated, skipped: false };
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  async getLandedCostDetail(procurementOrderId: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: procurementOrderId, deletedAt: null },
      include: {
        items: { where: { status: ProcurementOrderItemStatus.ACTIVE }, orderBy: { createdAt: 'asc' } },
        landedCostSnapshots: { orderBy: { calculatedAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Procurement order not found');

    const missingWeightItems = order.items.filter(
      (item) => item.weightStatus !== ProcurementItemWeightStatus.CONFIRMED,
    );

    return {
      procurementOrderId: order.id,
      landedCostStatus: order.landedCostStatus,
      costConfirmationStatus: order.costConfirmationStatus,
      estimatedSupplierCostKgs: Number(order.estimatedSupplierCostKgs ?? 0),
      estimatedYuanRate: Number(order.defaultYuanRate ?? 0),
      totalYuan: Number(order.totalYuan ?? 0),
      totalPaidYuan: Number(order.totalPaidYuan ?? 0),
      remainingYuan: Number(order.remainingYuan ?? 0),
      weightedAverageYuanRate:
        order.weightedAverageYuanRate != null ? Number(order.weightedAverageYuanRate) : null,
      landedCostCalculationVersion: order.landedCostCalculationVersion,
      landedCostCalculatedAt: order.landedCostCalculatedAt,
      isProvisional: order.landedCostStatus === ProcurementLandedCostStatus.PENDING_WEIGHT,
      missingWeightItems: missingWeightItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        weightStatus: item.weightStatus,
        unitWeightKg: item.unitWeightKg,
      })),
      allocationMethods: DEFAULT_EXPENSE_ALLOCATION,
      totalConfirmedExpenses: {
        chinaDomesticTransportKgs: Number(order.chinaDomesticTransportKgs ?? 0),
        cargoKgs: Number(order.totalCargoCostKgs ?? 0),
        kyrgyzstanTransportKgs: Number(order.localTransportKgs ?? 0),
        insuranceKgs: Number(order.insuranceCostKgs ?? 0),
        customsKgs: Number(order.customsCostKgs ?? 0),
        transportExpensesKgs: Number(order.bankFeeCostKgs ?? 0),
        packagingKgs: Number(order.packagingCostKgs ?? 0),
        otherExpensesKgs: Number(order.otherExpenseKgs ?? 0),
      },
      snapshots: order.landedCostSnapshots.map((snapshot) => ({
        ...snapshot,
        unitWeightKg: snapshot.unitWeightKg != null ? Number(snapshot.unitWeightKg) : null,
        totalWeightKg: Number(snapshot.totalWeightKg),
        basePurchaseCostKgs: Number(snapshot.basePurchaseCostKgs),
        allocatedChinaTransportKgs: Number(snapshot.allocatedChinaTransportKgs),
        allocatedCargoKgs: Number(snapshot.allocatedCargoKgs),
        allocatedKyrgyzstanTransportKgs: Number(snapshot.allocatedKyrgyzstanTransportKgs),
        allocatedInsuranceKgs: Number(snapshot.allocatedInsuranceKgs),
        allocatedCustomsKgs: Number(snapshot.allocatedCustomsKgs),
        allocatedTransportExpensesKgs: Number(snapshot.allocatedTransportExpensesKgs),
        allocatedPackagingKgs: Number(snapshot.allocatedPackagingKgs),
        allocatedOtherExpensesKgs: Number(snapshot.allocatedOtherExpensesKgs),
        totalLandedCostKgs: Number(snapshot.totalLandedCostKgs),
        unitLandedCostKgs: Number(snapshot.unitLandedCostKgs),
      })),
      items: order.items.map((item) => {
        const snapshot = order.landedCostSnapshots.find((row) => row.procurementOrderItemId === item.id);
        return {
          id: item.id,
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          quantity: item.quantity,
          receivedQuantity: item.receivedQuantity,
          unitWeightKg: item.unitWeightKg != null ? Number(item.unitWeightKg) : null,
          weightStatus: item.weightStatus,
          totalWeightKg: Number(item.totalWeightKg ?? 0),
          basePurchaseCostKgs: snapshot ? Number(snapshot.basePurchaseCostKgs) : Number(item.costKgs) * (item.receivedQuantity ?? item.quantity),
          finalCostKgs: Number(item.finalCostKgs),
          totalCostKgs: Number(item.totalCostKgs),
          snapshot,
        };
      }),
    };
  }

  validateFinalReceivingReadiness(order: {
    id: string;
    landedCostStatus: ProcurementLandedCostStatus;
    hqStockMovementCreatedAt?: Date | null;
    items: Array<{
      id: string;
      sku: string;
      productName: string;
      weightStatus: ProcurementItemWeightStatus;
      unitWeightKg?: unknown;
    }>;
  }) {
    const errors: string[] = [];
    if (order.hqStockMovementCreatedAt) {
      errors.push('Procurement stock has already been received');
    }
    if (order.landedCostStatus !== ProcurementLandedCostStatus.CALCULATED) {
      if (order.landedCostStatus === ProcurementLandedCostStatus.PENDING_WEIGHT) {
        errors.push('LANDED_COST_PENDING_WEIGHT');
      } else {
        errors.push(`Landed cost status must be CALCULATED (current: ${order.landedCostStatus})`);
      }
    }
    const missingWeight = order.items.filter(
      (item) => item.weightStatus !== ProcurementItemWeightStatus.CONFIRMED,
    );
    if (missingWeight.length > 0) {
      errors.push(
        `Missing confirmed weight for ${missingWeight.length} item(s): ${missingWeight
          .map((item) => item.sku || item.productName)
          .join(', ')}`,
      );
    }
    return { ready: errors.length === 0, errors, missingWeightItems: missingWeight };
  }

  async finalizeSnapshots(procurementOrderId: string, tx: TxClient) {
    await tx.procurementLandedCostSnapshot.updateMany({
      where: { procurementOrderId, isFinalized: false },
      data: { isFinalized: true, isProvisional: false },
    });
    await tx.procurementOrder.update({
      where: { id: procurementOrderId },
      data: { landedCostStatus: ProcurementLandedCostStatus.FINALIZED },
    });
  }

  /**
   * After HQ receive, update cost values only on existing stock movements / FIFO layers /
   * product + warehouse valuation — never create duplicate inventory movements.
   */
  private async syncReceivedInventoryCosts(
    client: TxClient,
    user: AuthUser | undefined,
    order: {
      id: string;
      hqWarehouseId?: string | null;
      items: Array<{
        id: string;
        productId: string;
        purchasePriceYuan: unknown;
        yuanRate: unknown;
        receivedQuantity?: number | null;
        quantity: number;
      }>;
    },
    calculated: LandedCostOrderResult,
  ) {
    const receivings = await client.procurementGoodsReceiving.findMany({
      where: { procurementOrderId: order.id, deletedAt: null },
      select: { id: true, hqWarehouseId: true },
    });
    if (!receivings.length) return;
    const receivingIds = receivings.map((row) => row.id);
    const warehouseId = order.hqWarehouseId ?? receivings[0]?.hqWarehouseId;
    if (!warehouseId) return;

    for (const [index, item] of order.items.entries()) {
      const next = calculated.items[index];
      if (!next) continue;
      const movements = await client.stockMovement.findMany({
        where: {
          productId: item.productId,
          warehouseId,
          type: StockMovementType.IN,
          status: 'ACTIVE',
          referenceType: 'PROCUREMENT_GOODS_RECEIVING',
          referenceId: { in: receivingIds },
        },
        orderBy: { createdAt: 'asc' },
      });

      const movementUpdates = resolveMovementCostUpdates({
        orderLineFinalUnitCostKgs: Number(next.finalCostKgs || 0),
        orderLineTotalCostKgs: Number(next.totalCostKgs || 0),
        movements: movements.map((movement) => ({
          id: movement.id,
          quantity: Math.abs(Number(movement.quantity)),
          totalCostKgs: Number(movement.totalCostKgs),
          unitCostKgs: Number(movement.unitCostKgs),
        })),
      });
      const updateByMovementId = new Map(movementUpdates.map((row) => [row.movementId, row]));

      let movementValueDelta = 0;
      let latestActiveUnitCostKgs = Number(next.finalCostKgs || 0);
      for (const movement of movements) {
        const update = updateByMovementId.get(movement.id);
        if (!update) continue;
        const qty = Math.abs(Number(movement.quantity));
        const unitCostKgs = update.unitCostKgs;
        const newTotal = update.totalCostKgs;
        const oldTotal = Number(movement.totalCostKgs);
        movementValueDelta += newTotal - oldTotal;
        latestActiveUnitCostKgs = unitCostKgs;
        await client.stockMovement.update({
          where: { id: movement.id },
          data: { unitCostKgs, totalCostKgs: newTotal },
        });

        const batch = await client.fifoInventoryBatch.findFirst({
          where: { stockMovementId: movement.id },
        });
        if (batch) {
          const layerUnitCostKgs = resolveUnitCostFromInventoryLayer({
            quantity: qty,
            totalCostKgs: newTotal,
            unitCostKgs,
          });
          const product = await client.product.findFirst({
            where: { id: item.productId, deletedAt: null },
            select: {
              wholesaleMarkupPercent: true,
              hqBranchWholesaleMarkupPercent: true,
              recommendedRetailMarkupPercent: true,
              minimumSellingMarkupPercent: true,
            },
          });
          const prices = pricesFromMarkups(layerUnitCostKgs, {
            wholesaleMarkupPercent: Number(product?.wholesaleMarkupPercent ?? 0),
            hqBranchWholesaleMarkupPercent: Number(product?.hqBranchWholesaleMarkupPercent ?? 0),
            recommendedRetailMarkupPercent: Number(product?.recommendedRetailMarkupPercent ?? 0),
            minimumSellingMarkupPercent: Number(product?.minimumSellingMarkupPercent ?? 0),
          });
          await client.fifoInventoryBatch.update({
            where: { id: batch.id },
            data: {
              unitCostKgs: layerUnitCostKgs,
              wholesalePriceKgs: prices.wholesalePriceKgs,
              hqBranchWholesalePriceKgs: prices.hqBranchWholesalePriceKgs,
              recommendedRetailPriceKgs: prices.recommendedRetailPriceKgs,
              minimumSellingPriceKgs: prices.minimumSellingPriceKgs,
            },
          });
        }
      }

      const unitCostKgs = latestActiveUnitCostKgs;
      const product = await client.product.findUnique({ where: { id: item.productId } });
      if (product) {
        const sellingPriceKgs = Number(product.sellingPriceKgs);
        const marginAmount =
          Math.round((sellingPriceKgs - unitCostKgs + Number.EPSILON) * 100) / 100;
        const marginPercent =
          sellingPriceKgs === 0
            ? 0
            : Math.round(((marginAmount / sellingPriceKgs) * 100 + Number.EPSILON) * 100) / 100;
        await client.product.update({
          where: { id: item.productId },
          data: {
            purchasePriceYuan: item.purchasePriceYuan as any,
            latestYuanRate: next.costKgs > 0 ? (item.yuanRate as any) : product.latestYuanRate,
            purchaseCostKgs: next.costKgs,
            transportCostKgs: next.transportCostKgs,
            finalCostKgs: unitCostKgs,
            marginAmount,
            marginPercent,
          },
        });
      }

      const balance = await client.inventoryBalance.findFirst({
        where: { warehouseId, productId: item.productId },
      });
      if (balance) {
        const quantity = Number(balance.quantity);
        const nextTotalValue =
          Math.round((Number(balance.totalValueKgs) + movementValueDelta + Number.EPSILON) * 100) /
          100;
        const nextAverage =
          quantity > 0
            ? Math.round((nextTotalValue / quantity + Number.EPSILON) * 100) / 100
            : unitCostKgs;
        await client.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            averageCostKgs: nextAverage,
            landedCostKgs: unitCostKgs,
            totalValueKgs: Math.max(0, nextTotalValue),
          },
        });
      }

      if (user) {
        await client.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'INVENTORY_COST_UPDATED',
            entity: 'Product',
            entityId: item.productId,
            metadata: {
              procurementOrderId: order.id,
              productId: item.productId,
              unitLandedCostKgs: unitCostKgs,
              totalLandedCostKgs: next.totalCostKgs,
              previousTotalCostDeltaKgs: movementValueDelta,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
    }
  }
}
