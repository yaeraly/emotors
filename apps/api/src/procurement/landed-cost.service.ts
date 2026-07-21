import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ProcurementLandedCostStatus,
  ProcurementOrderItemStatus,
  ProcurementItemWeightStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
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
import { resolveProcurementLogisticsInput } from './transport-logistics.util';
import { summarizeSupplierPayments } from './supplier-payment.util';

export type RecalculateProcurementOrderOptions = {
  reason?: string;
  triggerReason?: string;
  useDraftQuantities?: boolean;
  user?: AuthUser;
  finalize?: boolean;
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
          svhToHqTransport: { include: { transportCompany: true } },
          chinaReceivingDraftRows: { where: { isArchived: false } },
          landedCostSnapshots: true,
        },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.landedCostStatus === ProcurementLandedCostStatus.FINALIZED && !options.finalize) {
        return { order, calculated: null, skipped: true };
      }

      const previousSnapshots = order.landedCostSnapshots;
      const summary = summarizeSupplierPayments(
        (order.supplierPayments ?? []).map((payment) => ({
          amountYuan: Number(payment.amountYuan),
          exchangeRate: Number(payment.exchangeRate),
          amountKgs: Number(payment.amountKgs),
          actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
          approvedAmountKgs: payment.approvedAmountKgs != null ? Number(payment.approvedAmountKgs) : null,
          status: payment.status,
        })),
        Number(order.totalYuan),
        { invoiceSentToAccountantAt: (order as any).invoiceSentToAccountantAt },
      );
      const effectiveRate =
        summary.weightedAverageYuanRate && summary.totalPaidYuan > 0
          ? summary.weightedAverageYuanRate
          : Number(order.defaultYuanRate);

      const resolved = resolveProcurementLogisticsInput(order, order, effectiveRate);
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

      const landedCostStatus = order.hqStockMovementCreatedAt
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

      const updatedOrder = await client.procurementOrder.update({
        where: { id: order.id },
        data: {
          ...logisticsTotals,
          defaultUsdRate: cargo.usdRate,
          cargoRateUsdPerKg: cargo.cargoRateUsdPerKg,
          cargoTotalWeightKg,
          totalCargoCostUsd: calculated.totalCargoCostUsd,
          totalCargoCostKgs: calculated.totalCargoCostKgs,
          totalNetWeightKg: calculated.totalNetWeightKg,
          totalPackagingWeightKg: calculated.totalPackagingWeightKg,
          totalYuan: calculated.totalYuan,
          totalTransportCostKgs: calculated.totalTransportCostKgs,
          totalCostKgs: calculated.totalCostKgs,
          totalWeightKg: calculated.totalShipmentWeightKg,
          costPerKg: calculated.costPerKg,
          chinaExportTransportKgs: resolvedLogistics.chinaExportTransportKgs,
          localTransportKgs: transportResolved.localTransportKgs,
          landedCostStatus,
          landedCostCalculationVersion: nextVersion,
          landedCostCalculatedAt: new Date(),
          totalPaidYuan: summary.totalPaidYuan,
          totalPaidKgs: summary.totalPaidKgs,
          remainingYuan: summary.remainingYuan,
          weightedAverageYuanRate: summary.weightedAverageYuanRate,
          supplierPaymentStatus: summary.supplierPaymentStatus,
        },
        include: {
          items: { where: { status: ProcurementOrderItemStatus.ACTIVE }, orderBy: { createdAt: 'asc' } },
          landedCostSnapshots: true,
        },
      });

      if (!order.hqStockMovementCreatedAt) {
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
            isFinalized: false,
            isProvisional: calculated.isProvisional,
            calculatedAt: new Date(),
          };
          await client.procurementLandedCostSnapshot.upsert({
            where: { procurementOrderItemId: item.id },
            create: snapshotData,
            update: snapshotData,
          });
        }
      }

      if (options.user) {
        const auditAction = calculated.pendingWeight
          ? 'LANDED_COST_PENDING_WEIGHT'
          : 'LANDED_COST_RECALCULATED';
        await client.auditLog.create({
          data: {
            userId: options.user.id,
            role: options.user.role,
            action: auditAction,
            entity: 'ProcurementOrder',
            entityId: order.id,
            metadata: {
              userId: options.user.id,
              procurementOrderId: order.id,
              triggerReason: options.triggerReason ?? options.reason ?? 'recalculate',
              calculationVersion: nextVersion,
              landedCostStatus,
              isProvisional: calculated.isProvisional,
              oldSnapshotCount: previousSnapshots.length,
              timestamp: new Date().toISOString(),
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
}
