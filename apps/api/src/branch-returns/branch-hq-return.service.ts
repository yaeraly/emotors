import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchHqReturnCondition,
  BranchHqReturnFinancialAdjustmentStatus,
  BranchHqReturnStatus,
  Prisma,
  StockMovementType,
  WarehouseType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs } from '../common/authoritative-money.util';
import { syncInventoryBalanceValuationFromFifoRemainingInTx } from '../inventory/inventory-authoritative-value.util';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  buildHqReturnedFifoLayersFromConsumedAllocations,
  hqFifoReferenceTypeForReturnCondition,
  hqStockMovementTypeForReturnCondition,
  isNonSaleableBranchHqReturnCondition,
  previewBranchHqReturnFifoConsumption,
} from './branch-hq-return-fifo.util';
import { computeBranchHqReturnDebtAdjustment } from './branch-hq-return-finance.util';
import {
  canApproveBranchHqReturn,
  canCreateBranchHqReturn,
  canDecideBranchHqReturnFinance,
  canOperateBranchHqReturnShipping,
  canReceiveBranchHqReturnAtHq,
  canViewAllBranchHqReturns,
  canViewBranchHqReturns,
} from './branch-hq-return.permissions';
import {
  allItemsPicked,
  canApproveOrRejectBranchHqReturn,
  canEditBranchHqReturnDraft,
  canPickPackShipBranchHqReturn,
  canShipBranchHqReturn,
  canSubmitBranchHqReturn,
} from './branch-hq-return-status.util';
import { CreateBranchHqReturnDto } from './dto/create-branch-hq-return.dto';
import { DecideBranchHqReturnFinanceDto } from './dto/decide-branch-hq-return-finance.dto';
import { ReceiveBranchHqReturnDto } from './dto/receive-branch-hq-return.dto';
import { RejectBranchHqReturnDto } from './dto/reject-branch-hq-return.dto';

type PrismaTx = Prisma.TransactionClient;

const RETURN_INCLUDE = {
  branch: { select: { id: true, name: true, code: true, branchType: true } },
  sourceWarehouse: { select: { id: true, name: true, code: true, warehouseType: true } },
  destinationWarehouse: { select: { id: true, name: true, code: true, warehouseType: true } },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true } },
      pickedBy: { select: { id: true, fullName: true, role: true } },
      fifoAllocations: { orderBy: { createdAt: 'asc' as const } },
      discrepancies: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  fifoAllocations: { orderBy: { createdAt: 'asc' as const } },
  discrepancies: true,
  financialAdjustment: true,
  createdBy: { select: { id: true, fullName: true, role: true } },
  approvedBy: { select: { id: true, fullName: true, role: true } },
  rejectedBy: { select: { id: true, fullName: true, role: true } },
  shippedBy: { select: { id: true, fullName: true, role: true } },
  receivedBy: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.BranchHqReturnInclude;

@Injectable()
export class BranchHqReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(user: AuthUser, query?: { status?: string }) {
    this.assertCanView(user);
    const where: Prisma.BranchHqReturnWhereInput = {
      deletedAt: null,
      ...(query?.status ? { status: query.status as BranchHqReturnStatus } : {}),
      ...(canViewAllBranchHqReturns(user) ? {} : { branchId: user.branchId }),
    };
    const rows = await this.prisma.branchHqReturn.findMany({
      where,
      include: RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.present(row));
  }

  async get(user: AuthUser, id: string) {
    const row = await this.findAccessible(user, id);
    return this.present(row);
  }

  async create(user: AuthUser, dto: CreateBranchHqReturnDto) {
    if (!canCreateBranchHqReturn(user)) {
      throw new ForbiddenException('Only Branch Warehouse can create HQ returns');
    }
    if (!user.branchId) {
      throw new ForbiddenException('Branch context required');
    }

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: user.branchId, deletedAt: null },
        select: {
          id: true,
          assignedHqWarehouseId: true,
          warehouses: {
            where: { warehouseType: WarehouseType.BRANCH, deletedAt: null, isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!branch?.warehouses[0]) {
        throw new BadRequestException('Branch warehouse not found');
      }
      if (!branch.assignedHqWarehouseId) {
        throw new BadRequestException('Branch has no assigned HQ warehouse for returns');
      }

      const sourceWarehouseId = branch.warehouses[0].id;
      const destinationWarehouseId = branch.assignedHqWarehouseId;
      const preparedItems = [];

      for (const line of dto.items) {
        const product = await tx.product.findFirst({
          where: {
            id: line.productId,
            branchId: user.branchId,
            deletedAt: null,
          },
        });
        if (!product) {
          throw new BadRequestException(`Product not found in branch inventory: ${line.productId}`);
        }

        const available = await this.getBranchAvailableQty(tx, {
          branchId: user.branchId,
          warehouseId: sourceWarehouseId,
          productId: product.id,
        });
        if (line.quantity > available) {
          throw new BadRequestException(
            `Нельзя вернуть больше доступного остатка. SKU ${product.sku}: запрошено ${line.quantity}, доступно ${available}`,
          );
        }

        // Soft FIFO cost preview at create — authoritative consume happens on ship.
        const fifoPreview = await this.previewFifoForProduct(tx, {
          warehouseId: sourceWarehouseId,
          productId: product.id,
          quantity: line.quantity,
        });
        if (fifoPreview.allocatedQty < line.quantity) {
          throw new BadRequestException(
            `Недостаточно FIFO-слоёв для SKU ${product.sku}. Запрошено ${line.quantity}, доступно по FIFO ${fifoPreview.allocatedQty}`,
          );
        }

        preparedItems.push({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity: line.quantity,
          availableAtCreate: available,
          reason: line.reason,
          condition: line.condition,
          comment: line.comment?.trim() || null,
          unitCostKgs: fifoPreview.unitCostKgs,
          lineReturnValueKgs: fifoPreview.totalCostKgs,
        });
      }

      const totalQuantity = preparedItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalReturnValueKgs = sumDisplayMoneyTotals(
        preparedItems.map((item) => Number(item.lineReturnValueKgs)),
      );
      const returnNumber = await this.generateReturnNumber(tx);

      const created = await tx.branchHqReturn.create({
        data: {
          returnNumber,
          branchId: user.branchId,
          sourceWarehouseId,
          destinationWarehouseId,
          status: BranchHqReturnStatus.DRAFT,
          totalQuantity,
          totalLineCount: preparedItems.length,
          totalReturnValueKgs,
          note: dto.note?.trim() || null,
          createdById: user.id,
          items: { create: preparedItems },
        },
        include: RETURN_INCLUDE,
      });

      await this.audit(tx, user, 'RETURN_CREATED', created.id, {
        branchId: created.branchId,
        returnNumber: created.returnNumber,
        totalQuantity,
        totalReturnValueKgs,
      });

      return this.present(created);
    });
  }

  async submit(user: AuthUser, id: string) {
    if (!canCreateBranchHqReturn(user)) {
      throw new ForbiddenException('Only Branch Warehouse can submit returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (!canSubmitBranchHqReturn(current.status)) {
        throw new BadRequestException('Return can only be submitted from DRAFT');
      }
      if (!current.items.length) {
        throw new BadRequestException('Return has no items');
      }
      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: { status: BranchHqReturnStatus.PENDING_BRANCH_APPROVAL, version: { increment: 1 } },
        include: RETURN_INCLUDE,
      });
      await this.audit(tx, user, 'RETURN_SUBMITTED', id, { branchId: updated.branchId });
      return this.present(updated);
    });
  }

  async approve(user: AuthUser, id: string) {
    if (!canApproveBranchHqReturn(user)) {
      throw new ForbiddenException('Only Branch Manager can approve returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (!canApproveOrRejectBranchHqReturn(current.status)) {
        throw new BadRequestException('Return is not pending branch approval');
      }

      for (const item of current.items) {
        const available = await this.getBranchAvailableQty(tx, {
          branchId: current.branchId,
          warehouseId: current.sourceWarehouseId,
          productId: item.productId,
        });
        if (item.quantity > available) {
          throw new BadRequestException(
            `Недостаточно доступного остатка для согласования. SKU ${item.sku}: нужно ${item.quantity}, доступно ${available}`,
          );
        }
        await this.reserveItemFifo(tx, user, current, item);
        await tx.inventoryBalance.updateMany({
          where: {
            branchId: current.branchId,
            warehouseId: current.sourceWarehouseId,
            productId: item.productId,
          },
          data: { reservedQuantity: { increment: item.quantity } },
        });
      }

      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: {
          status: BranchHqReturnStatus.BRANCH_APPROVED,
          approvedById: user.id,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
        include: RETURN_INCLUDE,
      });

      await this.audit(tx, user, 'RETURN_APPROVED', id, { branchId: updated.branchId });
      await this.audit(tx, user, 'RETURN_RESERVED', id, {
        branchId: updated.branchId,
        reservedQuantity: updated.totalQuantity,
      });
      return this.present(updated);
    });
  }

  async reject(user: AuthUser, id: string, dto: RejectBranchHqReturnDto) {
    if (!canApproveBranchHqReturn(user)) {
      throw new ForbiddenException('Only Branch Manager can reject returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (!canApproveOrRejectBranchHqReturn(current.status)) {
        throw new BadRequestException('Return is not pending branch approval');
      }
      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: {
          status: BranchHqReturnStatus.REJECTED,
          rejectedById: user.id,
          rejectedAt: new Date(),
          rejectionReason: dto.reason?.trim() || null,
          version: { increment: 1 },
        },
        include: RETURN_INCLUDE,
      });
      await this.audit(tx, user, 'RETURN_REJECTED', id, {
        branchId: updated.branchId,
        reason: dto.reason ?? null,
      });
      return this.present(updated);
    });
  }

  async startPicking(user: AuthUser, id: string) {
    if (!canOperateBranchHqReturnShipping(user)) {
      throw new ForbiddenException('Only Branch Warehouse can pick returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (
        current.status !== BranchHqReturnStatus.BRANCH_APPROVED &&
        current.status !== BranchHqReturnStatus.READY_TO_SHIP
      ) {
        throw new BadRequestException('Return is not ready for picking');
      }
      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: { status: BranchHqReturnStatus.PICKING, version: { increment: 1 } },
        include: RETURN_INCLUDE,
      });
      return this.present(updated);
    });
  }

  async setItemPicked(user: AuthUser, id: string, itemId: string, picked: boolean) {
    if (!canOperateBranchHqReturnShipping(user)) {
      throw new ForbiddenException('Only Branch Warehouse can mark picking');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (!canPickPackShipBranchHqReturn(current.status) && current.status !== BranchHqReturnStatus.PICKING) {
        throw new BadRequestException('Picking is only allowed after branch approval');
      }
      if (current.status === BranchHqReturnStatus.BRANCH_APPROVED || current.status === BranchHqReturnStatus.READY_TO_SHIP) {
        await tx.branchHqReturn.update({
          where: { id },
          data: { status: BranchHqReturnStatus.PICKING },
        });
      }
      const item = current.items.find((row) => row.id === itemId);
      if (!item) throw new NotFoundException('Return item not found');

      await tx.branchHqReturnItem.update({
        where: { id: itemId },
        data: picked
          ? { pickedAt: new Date(), pickedByUserId: user.id }
          : { pickedAt: null, pickedByUserId: null },
      });
      await this.audit(tx, user, 'ITEM_PICKED', id, {
        branchId: current.branchId,
        productId: item.productId,
        quantity: item.quantity,
        picked,
        returnItemId: itemId,
      });

      const refreshed = await tx.branchHqReturn.findFirstOrThrow({
        where: { id },
        include: RETURN_INCLUDE,
      });
      return this.present(refreshed);
    });
  }

  async pack(user: AuthUser, id: string) {
    if (!canOperateBranchHqReturnShipping(user)) {
      throw new ForbiddenException('Only Branch Warehouse can pack returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (current.status !== BranchHqReturnStatus.PICKING && current.status !== BranchHqReturnStatus.READY_TO_SHIP) {
        throw new BadRequestException('Return must be in picking before pack');
      }
      if (!allItemsPicked(current.items)) {
        throw new BadRequestException('Нельзя упаковать: не все товары собраны');
      }
      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: {
          status: BranchHqReturnStatus.PACKED,
          packedAt: new Date(),
          version: { increment: 1 },
        },
        include: RETURN_INCLUDE,
      });
      await this.audit(tx, user, 'RETURN_PACKED', id, { branchId: updated.branchId });
      return this.present(updated);
    });
  }

  async ship(user: AuthUser, id: string) {
    if (!canOperateBranchHqReturnShipping(user)) {
      throw new ForbiddenException('Only Branch Warehouse can ship returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      if (current.status === BranchHqReturnStatus.SHIPPED_TO_HQ) {
        return this.present(current); // idempotent
      }
      if (!canShipBranchHqReturn(current.status)) {
        throw new BadRequestException('Return is not ready to ship');
      }
      if (!allItemsPicked(current.items) && current.status !== BranchHqReturnStatus.PACKED) {
        throw new BadRequestException('Нельзя отправить: не все товары собраны');
      }

      let totalReturnValueKgs = 0;
      let inTransitQuantity = 0;

      for (const item of current.items) {
        const existingConsumed = await tx.branchHqReturnFifoAllocation.findMany({
          where: { returnItemId: item.id, status: 'CONSUMED' },
        });
        if (existingConsumed.length) {
          // Idempotent re-entry: skip physical deduct.
          const lineValue = sumDisplayMoneyTotals(existingConsumed.map((row) => Number(row.totalCostKgs)));
          totalReturnValueKgs = roundDisplayMoney(totalReturnValueKgs + lineValue);
          inTransitQuantity += item.quantity;
          continue;
        }

        const consumed = await this.consumeReservedItemFifo(tx, user, current, item);
        if (consumed.allocatedQty < item.quantity) {
          throw new BadRequestException(
            `Недостаточно FIFO при отгрузке SKU ${item.sku}. Нужно ${item.quantity}, доступно ${consumed.allocatedQty}`,
          );
        }
        if (!(consumed.totalCostKgs > 0)) {
          throw new BadRequestException(
            `Не удалось определить себестоимость FIFO для SKU ${item.sku}. Отгрузка заблокирована.`,
          );
        }

        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: item.productId,
          warehouseId: current.sourceWarehouseId,
          type: StockMovementType.OUT,
          quantity: item.quantity,
          unitCostKgs: consumed.unitCostKgs,
          referenceType: 'BRANCH_HQ_RETURN',
          referenceId: current.id,
          note: `Branch HQ return ${current.returnNumber}`,
        });

        await tx.inventoryBalance.updateMany({
          where: {
            branchId: current.branchId,
            warehouseId: current.sourceWarehouseId,
            productId: item.productId,
          },
          data: { reservedQuantity: { decrement: item.quantity } },
        });

        await syncInventoryBalanceValuationFromFifoRemainingInTx(tx, {
          branchId: current.branchId,
          warehouseId: current.sourceWarehouseId,
          productId: item.productId,
        });

        await tx.branchHqReturnItem.update({
          where: { id: item.id },
          data: {
            shippedQuantity: item.quantity,
            inTransitQuantity: item.quantity,
            unitCostKgs: consumed.unitCostKgs,
            lineReturnValueKgs: consumed.totalCostKgs,
          },
        });

        totalReturnValueKgs = roundDisplayMoney(totalReturnValueKgs + consumed.totalCostKgs);
        inTransitQuantity += item.quantity;
      }

      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: {
          status: BranchHqReturnStatus.SHIPPED_TO_HQ,
          shippedAt: new Date(),
          shippedById: user.id,
          totalReturnValueKgs,
          inTransitQuantity,
          version: { increment: 1 },
        },
        include: RETURN_INCLUDE,
      });

      await this.audit(tx, user, 'RETURN_SHIPPED', id, {
        branchId: updated.branchId,
        inTransitQuantity,
        totalReturnValueKgs,
        salesRevenueKgs: 0,
        profitKgs: 0,
      });
      return this.present(updated);
    });
  }

  async receive(user: AuthUser, id: string, dto: ReceiveBranchHqReturnDto) {
    if (!canReceiveBranchHqReturnAtHq(user)) {
      throw new ForbiddenException('Only HQ Warehouse can receive branch returns');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id, { allowHq: true });
      if (current.status === BranchHqReturnStatus.HQ_ACCEPTED || current.status === BranchHqReturnStatus.COMPLETED) {
        return this.present(current); // idempotent
      }
      if (
        current.status !== BranchHqReturnStatus.SHIPPED_TO_HQ &&
        current.status !== BranchHqReturnStatus.DISCREPANCY &&
        current.status !== BranchHqReturnStatus.RECEIVED_AT_HQ
      ) {
        throw new BadRequestException('Return is not awaiting HQ receipt');
      }

      let hasDiscrepancy = false;
      let acceptedValue = 0;
      let remainingInTransit = 0;

      for (const line of dto.items) {
        const item = current.items.find((row) => row.id === line.itemId);
        if (!item) throw new BadRequestException(`Unknown return item ${line.itemId}`);
        const shipped = item.shippedQuantity || item.quantity;
        if (line.receivedQuantity > shipped) {
          throw new BadRequestException(
            `Принятое количество не может превышать отправленное. SKU ${item.sku}: отправлено ${shipped}, принято ${line.receivedQuantity}`,
          );
        }
        if (line.damagedQuantity > line.receivedQuantity) {
          throw new BadRequestException(`Повреждённое количество не может превышать принятое (SKU ${item.sku})`);
        }

        const difference = shipped - line.receivedQuantity;
        if (difference > 0) hasDiscrepancy = true;

        const consumed = await tx.branchHqReturnFifoAllocation.findMany({
          where: { returnItemId: item.id, status: { in: ['CONSUMED', 'HQ_RECEIVED'] } },
          orderBy: { createdAt: 'asc' },
        });
        const alreadyReceived = consumed.filter((row) => row.status === 'HQ_RECEIVED');
        if (alreadyReceived.length && line.receivedQuantity > 0) {
          // Idempotent: keep existing HQ layers.
          const existingValue = sumDisplayMoneyTotals(alreadyReceived.map((row) => Number(row.totalCostKgs)));
          acceptedValue = roundDisplayMoney(acceptedValue + existingValue);
          remainingInTransit += Math.max(0, shipped - line.receivedQuantity);
          continue;
        }

        const receiveLayers = buildHqReturnedFifoLayersFromConsumedAllocations(
          consumed
            .filter((row) => row.status === 'CONSUMED')
            .map((row) => ({
              id: row.id,
              fifoBatchId: row.fifoBatchId,
              quantity: row.quantity,
              unitCostKgs: Number(row.unitCostKgs),
              totalCostKgs: Number(row.totalCostKgs),
              sourceReferenceType: row.sourceReferenceType,
              sourceReferenceId: row.sourceReferenceId,
            })),
          line.receivedQuantity,
        );

        const hqProduct = await this.resolveHqProductBySku(tx, {
          sku: item.sku,
          hqWarehouseId: current.destinationWarehouseId,
        });

        for (const layer of receiveLayers) {
          const condition = line.condition;
          const movementType =
            hqStockMovementTypeForReturnCondition(condition) === 'DEFECTIVE_IN'
              ? StockMovementType.DEFECTIVE_IN
              : StockMovementType.IN;
          const referenceType = hqFifoReferenceTypeForReturnCondition(condition);

          const movement = await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: hqProduct.productId,
            warehouseId: current.destinationWarehouseId,
            type: movementType,
            quantity: layer.quantity,
            unitCostKgs: layer.unitCostKgs,
            referenceType,
            referenceId: layer.allocationId,
            note: `Branch return ${current.returnNumber} / ${item.sku}`,
          });

          const hqBatch = await tx.fifoInventoryBatch.create({
            data: {
              productId: hqProduct.productId,
              warehouseId: current.destinationWarehouseId,
              stockMovementId: movement.id,
              receivedAt: new Date(),
              unitCostKgs: layer.unitCostKgs,
              initialQuantity: layer.quantity,
              remainingQuantity: layer.quantity,
              reservedQuantity: isNonSaleableBranchHqReturnCondition(condition) ? layer.quantity : 0,
              referenceType,
              referenceId: layer.allocationId,
            },
          });

          await tx.branchHqReturnFifoAllocation.update({
            where: { id: layer.allocationId },
            data: {
              status: 'HQ_RECEIVED',
              hqFifoBatchId: hqBatch.id,
            },
          });

          await this.audit(tx, user, 'HQ_INVENTORY_RECEIVED', id, {
            branchId: current.branchId,
            productId: hqProduct.productId,
            quantity: layer.quantity,
            cost: layer.totalCostKgs,
            sourceFifoLayer: layer.sourceFifoBatchId,
            hqFifoLayer: hqBatch.id,
            condition,
            saleable: !isNonSaleableBranchHqReturnCondition(condition),
          });

          acceptedValue = roundDisplayMoney(acceptedValue + layer.totalCostKgs);
        }

        await tx.branchHqReturnItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: line.receivedQuantity,
            damagedQuantity: line.damagedQuantity,
            differenceQuantity: difference,
            inTransitQuantity: difference,
            hqCondition: line.condition,
            hqReceivingNote: line.note?.trim() || null,
          },
        });

        if (difference > 0) {
          await tx.branchHqReturnDiscrepancy.upsert({
            where: { returnItemId: item.id },
            create: {
              returnId: current.id,
              returnItemId: item.id,
              productId: item.productId,
              expectedQuantity: shipped,
              receivedQuantity: line.receivedQuantity,
              differenceQuantity: difference,
              comment: line.note?.trim() || null,
              createdById: user.id,
            },
            update: {
              expectedQuantity: shipped,
              receivedQuantity: line.receivedQuantity,
              differenceQuantity: difference,
              comment: line.note?.trim() || null,
            },
          });
          await this.audit(tx, user, 'RETURN_DISCREPANCY', id, {
            branchId: current.branchId,
            productId: item.productId,
            expected: shipped,
            received: line.receivedQuantity,
            difference,
            userId: user.id,
            comment: line.note ?? null,
          });
        }

        remainingInTransit += difference;
      }

      const nextStatus = hasDiscrepancy
        ? BranchHqReturnStatus.DISCREPANCY
        : BranchHqReturnStatus.HQ_ACCEPTED;

      const debt = await this.getBranchDebt(tx, current.branchId);
      const suggestion = computeBranchHqReturnDebtAdjustment({
        acceptedReturnValueKgs: acceptedValue,
        currentDebtKgs: debt,
      });

      await tx.branchHqReturnFinancialAdjustment.upsert({
        where: { returnId: current.id },
        create: {
          returnId: current.id,
          branchId: current.branchId,
          status:
            acceptedValue > 0
              ? BranchHqReturnFinancialAdjustmentStatus.PENDING
              : BranchHqReturnFinancialAdjustmentStatus.NOT_REQUIRED,
          acceptedReturnValueKgs: acceptedValue,
          currentDebtKgs: debt,
          suggestedCreditKgs: suggestion.suggestedCreditKgs,
          resultingDebtKgs: suggestion.resultingDebtKgs,
          remainingCreditKgs: suggestion.remainingCreditKgs,
        },
        update: {
          acceptedReturnValueKgs: acceptedValue,
          currentDebtKgs: debt,
          suggestedCreditKgs: suggestion.suggestedCreditKgs,
          resultingDebtKgs: suggestion.resultingDebtKgs,
          remainingCreditKgs: suggestion.remainingCreditKgs,
          status:
            acceptedValue > 0
              ? BranchHqReturnFinancialAdjustmentStatus.PENDING
              : BranchHqReturnFinancialAdjustmentStatus.NOT_REQUIRED,
        },
      });

      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: {
          status: nextStatus,
          receivedAt: new Date(),
          receivedById: user.id,
          inTransitQuantity: remainingInTransit,
          version: { increment: 1 },
        },
        include: RETURN_INCLUDE,
      });

      await this.audit(tx, user, 'RETURN_RECEIVED', id, {
        branchId: updated.branchId,
        acceptedReturnValueKgs: acceptedValue,
        hasDiscrepancy,
        salesRevenueKgs: 0,
        profitKgs: 0,
      });
      return this.present(updated);
    });
  }

  async decideFinance(user: AuthUser, id: string, dto: DecideBranchHqReturnFinanceDto) {
    if (!canDecideBranchHqReturnFinance(user)) {
      throw new ForbiddenException('Only HQ Finance/Accountant can decide return adjustments');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id, { allowHq: true });
      const adjustment = current.financialAdjustment;
      if (!adjustment) {
        throw new BadRequestException('Financial adjustment is not available yet');
      }
      if (adjustment.status === BranchHqReturnFinancialAdjustmentStatus.APPROVED) {
        return this.present(current); // idempotent
      }
      if (adjustment.status === BranchHqReturnFinancialAdjustmentStatus.REJECTED && !dto.approve) {
        return this.present(current);
      }
      if (adjustment.status !== BranchHqReturnFinancialAdjustmentStatus.PENDING) {
        throw new BadRequestException('Financial adjustment already processed');
      }

      if (!dto.approve) {
        await tx.branchHqReturnFinancialAdjustment.update({
          where: { id: adjustment.id },
          data: {
            status: BranchHqReturnFinancialAdjustmentStatus.REJECTED,
            decidedById: user.id,
            decidedAt: new Date(),
            decisionNote: dto.note?.trim() || null,
            version: { increment: 1 },
          },
        });
        const updated = await tx.branchHqReturn.update({
          where: { id },
          data: {
            status:
              current.status === BranchHqReturnStatus.DISCREPANCY
                ? BranchHqReturnStatus.DISCREPANCY
                : BranchHqReturnStatus.HQ_ACCEPTED,
            version: { increment: 1 },
          },
          include: RETURN_INCLUDE,
        });
        return this.present(updated);
      }

      const debt = await this.getBranchDebt(tx, current.branchId);
      const computed = computeBranchHqReturnDebtAdjustment({
        acceptedReturnValueKgs: Number(adjustment.acceptedReturnValueKgs),
        currentDebtKgs: debt,
      });

      await tx.branchAccountBalance.upsert({
        where: { branchId: current.branchId },
        create: {
          branchId: current.branchId,
          totalDebt: computed.resultingDebtKgs,
          totalPaid: computed.appliedCreditKgs,
        },
        update: {
          totalDebt: computed.resultingDebtKgs,
        },
      });

      await tx.branchHqReturnFinancialAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: BranchHqReturnFinancialAdjustmentStatus.APPROVED,
          currentDebtKgs: debt,
          suggestedCreditKgs: computed.suggestedCreditKgs,
          appliedCreditKgs: computed.appliedCreditKgs,
          resultingDebtKgs: computed.resultingDebtKgs,
          remainingCreditKgs: computed.remainingCreditKgs,
          decidedById: user.id,
          decidedAt: new Date(),
          decisionNote: dto.note?.trim() || null,
          version: { increment: 1 },
        },
      });

      const nextStatus =
        current.status === BranchHqReturnStatus.DISCREPANCY
          ? BranchHqReturnStatus.DISCREPANCY
          : BranchHqReturnStatus.COMPLETED;

      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: {
          status: nextStatus,
          completedAt: nextStatus === BranchHqReturnStatus.COMPLETED ? new Date() : null,
          version: { increment: 1 },
        },
        include: RETURN_INCLUDE,
      });

      await this.audit(tx, user, 'FINANCIAL_ADJUSTMENT_APPROVED', id, {
        branchId: updated.branchId,
        appliedCreditKgs: computed.appliedCreditKgs,
        resultingDebtKgs: computed.resultingDebtKgs,
        remainingCreditKgs: computed.remainingCreditKgs,
        salesRevenueKgs: 0,
        profitKgs: 0,
      });
      if (nextStatus === BranchHqReturnStatus.COMPLETED) {
        await this.audit(tx, user, 'RETURN_COMPLETED', id, {
          branchId: updated.branchId,
          totalReturnValueKgs: toApiMoneyKgs(updated.totalReturnValueKgs),
        });
      }
      return this.present(updated);
    });
  }

  async cancel(user: AuthUser, id: string) {
    if (!canCreateBranchHqReturn(user) && !canApproveBranchHqReturn(user)) {
      throw new ForbiddenException('Not allowed to cancel return');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findAccessibleInTx(tx, user, id);
      const cancellable = new Set<BranchHqReturnStatus>([
        BranchHqReturnStatus.DRAFT,
        BranchHqReturnStatus.PENDING_BRANCH_APPROVAL,
        BranchHqReturnStatus.BRANCH_APPROVED,
        BranchHqReturnStatus.READY_TO_SHIP,
        BranchHqReturnStatus.PICKING,
        BranchHqReturnStatus.PACKED,
      ]);
      if (!cancellable.has(current.status)) {
        throw new BadRequestException('Return can no longer be cancelled');
      }

      if (
        current.status !== BranchHqReturnStatus.DRAFT &&
        current.status !== BranchHqReturnStatus.PENDING_BRANCH_APPROVAL
      ) {
        await this.releaseReservations(tx, user, current);
      }

      const updated = await tx.branchHqReturn.update({
        where: { id },
        data: { status: BranchHqReturnStatus.CANCELLED, version: { increment: 1 } },
        include: RETURN_INCLUDE,
      });
      return this.present(updated);
    });
  }

  private async reserveItemFifo(
    tx: PrismaTx,
    user: AuthUser,
    current: { id: string; sourceWarehouseId: string },
    item: { id: string; productId: string; quantity: number; sku: string },
  ) {
    const existing = await tx.branchHqReturnFifoAllocation.findMany({
      where: { returnItemId: item.id, status: 'RESERVED' },
    });
    if (existing.length) return;

    const preview = await this.previewFifoForProduct(tx, {
      warehouseId: current.sourceWarehouseId,
      productId: item.productId,
      quantity: item.quantity,
    });
    if (preview.allocatedQty < item.quantity) {
      throw new BadRequestException(
        `Недостаточно FIFO для резервирования SKU ${item.sku}. Нужно ${item.quantity}, доступно ${preview.allocatedQty}`,
      );
    }

    for (const line of preview.lines) {
      const updated = await tx.fifoInventoryBatch.updateMany({
        where: {
          id: line.batchId,
          remainingQuantity: { gte: line.quantity },
        },
        data: { reservedQuantity: { increment: line.quantity } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(`FIFO layer ${line.batchId} could not be reserved`);
      }
      const batch = await tx.fifoInventoryBatch.findUnique({ where: { id: line.batchId } });
      if (!batch || batch.reservedQuantity > batch.remainingQuantity) {
        throw new BadRequestException(`FIFO layer ${line.batchId} reserved beyond remaining`);
      }

      await tx.branchHqReturnFifoAllocation.create({
        data: {
          returnId: current.id,
          returnItemId: item.id,
          fifoBatchId: line.batchId,
          productId: item.productId,
          quantity: line.quantity,
          unitCostKgs: line.unitCostKgs,
          totalCostKgs: line.totalCostKgs,
          status: 'RESERVED',
          sourceReferenceType: line.sourceReferenceType ?? null,
          sourceReferenceId: line.sourceReferenceId ?? null,
        },
      });
    }
  }

  private async consumeReservedItemFifo(
    tx: PrismaTx,
    user: AuthUser,
    current: { id: string; sourceWarehouseId: string; returnNumber: string },
    item: { id: string; productId: string; quantity: number; sku: string },
  ): Promise<{
    lines: Array<{ batchId: string; quantity: number; unitCostKgs: number; totalCostKgs: number }>;
    allocatedQty: number;
    totalCostKgs: number;
    unitCostKgs: number;
  }> {
    let reserved = await tx.branchHqReturnFifoAllocation.findMany({
      where: { returnItemId: item.id, status: 'RESERVED' },
      orderBy: { createdAt: 'asc' },
    });
    if (!reserved.length) {
      // Reserve then consume atomically if approval path skipped somehow.
      await this.reserveItemFifo(tx, user, current, item);
      reserved = await tx.branchHqReturnFifoAllocation.findMany({
        where: { returnItemId: item.id, status: 'RESERVED' },
        orderBy: { createdAt: 'asc' },
      });
    }

    const lines: Array<{
      batchId: string;
      quantity: number;
      unitCostKgs: number;
      totalCostKgs: number;
    }> = [];
    const totals: number[] = [];
    for (const row of reserved) {
      await tx.fifoInventoryBatch.update({
        where: { id: row.fifoBatchId },
        data: {
          remainingQuantity: { decrement: row.quantity },
          reservedQuantity: { decrement: row.quantity },
        },
      });
      await tx.branchHqReturnFifoAllocation.update({
        where: { id: row.id },
        data: { status: 'CONSUMED' },
      });
      lines.push({
        batchId: row.fifoBatchId,
        quantity: row.quantity,
        unitCostKgs: Number(row.unitCostKgs),
        totalCostKgs: Number(row.totalCostKgs),
      });
      totals.push(Number(row.totalCostKgs));
      await this.audit(tx, user, 'FIFO_LAYER_DEDUCTED', current.id, {
        branchId: null,
        productId: item.productId,
        quantity: row.quantity,
        cost: Number(row.totalCostKgs),
        sourceFifoLayer: row.fifoBatchId,
      });
    }
    const allocatedQty = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalCostKgs = sumDisplayMoneyTotals(totals);
    return {
      lines,
      allocatedQty,
      totalCostKgs,
      unitCostKgs: deriveDisplayUnitCost(totalCostKgs, allocatedQty),
    };
  }

  private async releaseReservations(
    tx: PrismaTx,
    user: AuthUser,
    current: {
      id: string;
      branchId: string;
      sourceWarehouseId: string;
      items: Array<{ id: string; productId: string; quantity: number }>;
    },
  ) {
    const reserved = await tx.branchHqReturnFifoAllocation.findMany({
      where: { returnId: current.id, status: 'RESERVED' },
    });
    for (const row of reserved) {
      const batch = await tx.fifoInventoryBatch.findUnique({
        where: { id: row.fifoBatchId },
        select: { reservedQuantity: true },
      });
      const releaseQty = Math.min(row.quantity, Math.max(0, batch?.reservedQuantity ?? 0));
      if (releaseQty > 0) {
        await tx.fifoInventoryBatch.update({
          where: { id: row.fifoBatchId },
          data: { reservedQuantity: { decrement: releaseQty } },
        });
      }
      await tx.branchHqReturnFifoAllocation.delete({ where: { id: row.id } });
    }
    for (const item of current.items) {
      await tx.inventoryBalance.updateMany({
        where: {
          branchId: current.branchId,
          warehouseId: current.sourceWarehouseId,
          productId: item.productId,
        },
        data: { reservedQuantity: { decrement: item.quantity } },
      });
    }
    await this.audit(tx, user, 'FIFO_RESERVATION_RELEASED', current.id, {
      branchId: current.branchId,
    });
  }

  private async previewFifoForProduct(
    tx: PrismaTx,
    input: { warehouseId: string; productId: string; quantity: number },
  ) {
    const batches = await tx.fifoInventoryBatch.findMany({
      where: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return previewBranchHqReturnFifoConsumption(
      batches.map((batch) => ({
        batchId: batch.id,
        remainingQuantity: batch.remainingQuantity,
        reservedQuantity: batch.reservedQuantity,
        unitCostKgs: Number(batch.unitCostKgs),
        initialQuantity: batch.initialQuantity,
        layerTotalCostKgs: roundDisplayMoney(Number(batch.unitCostKgs) * batch.initialQuantity),
        sourceReferenceType: batch.referenceType,
        sourceReferenceId: batch.referenceId,
      })),
      input.quantity,
      { subtractReserved: true },
    );
  }

  private async getBranchAvailableQty(
    tx: PrismaTx,
    input: { branchId: string; warehouseId: string; productId: string },
  ) {
    const balance = await tx.inventoryBalance.findUnique({
      where: {
        branchId_warehouseId_productId: {
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          productId: input.productId,
        },
      },
    });
    return Math.max(0, (balance?.quantity ?? 0) - (balance?.reservedQuantity ?? 0));
  }

  private async getBranchDebt(tx: PrismaTx, branchId: string) {
    const balance = await tx.branchAccountBalance.findUnique({ where: { branchId } });
    return Math.max(0, toApiMoneyKgs(balance?.totalDebt ?? 0));
  }

  private async resolveHqProductBySku(
    tx: PrismaTx,
    input: { sku: string; hqWarehouseId: string },
  ) {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.hqWarehouseId, deletedAt: null },
      select: { id: true, branchId: true, warehouseType: true },
    });
    if (!warehouse || warehouse.warehouseType !== WarehouseType.HQ) {
      throw new BadRequestException('HQ destination warehouse is invalid');
    }
    const product = await tx.product.findFirst({
      where: {
        sku: input.sku,
        deletedAt: null,
        OR: [
          { warehouseId: input.hqWarehouseId },
          { branchId: warehouse.branchId ?? undefined },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!product) {
      throw new BadRequestException(`HQ catalog product not found for SKU ${input.sku}`);
    }
    return { productId: product.id, branchId: product.branchId };
  }

  private async generateReturnNumber(tx: PrismaTx) {
    const count = await tx.branchHqReturn.count();
    return `BHR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private assertCanView(user: AuthUser) {
    if (!canViewBranchHqReturns(user)) {
      throw new ForbiddenException('Not allowed to view branch HQ returns');
    }
  }

  private async findAccessible(
    user: AuthUser,
    id: string,
    options?: { allowHq?: boolean },
  ) {
    return this.prisma.$transaction((tx) => this.findAccessibleInTx(tx, user, id, options));
  }

  private async findAccessibleInTx(
    tx: PrismaTx,
    user: AuthUser,
    id: string,
    options?: { allowHq?: boolean },
  ) {
    this.assertCanView(user);
    const row = await tx.branchHqReturn.findFirst({
      where: { id, deletedAt: null },
      include: RETURN_INCLUDE,
    });
    if (!row) throw new NotFoundException('Return not found');
    if (!canViewAllBranchHqReturns(user) && !options?.allowHq) {
      if (!user.branchId || row.branchId !== user.branchId) {
        throw new ForbiddenException('You can only access your own branch returns');
      }
    }
    if (
      options?.allowHq &&
      !canViewAllBranchHqReturns(user) &&
      !canReceiveBranchHqReturnAtHq(user) &&
      !canDecideBranchHqReturnFinance(user)
    ) {
      throw new ForbiddenException('Not allowed');
    }
    return row;
  }

  private async audit(
    tx: PrismaTx,
    user: AuthUser,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'BranchHqReturn',
        entityId,
        metadata: {
          ...metadata,
          userId: user.id,
          role: user.role,
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private present(row: any) {
    const pickingProgress = {
      pickedCount: (row.items ?? []).filter((item: any) => item.pickedAt != null).length,
      totalCount: (row.items ?? []).filter((item: any) => Number(item.quantity) > 0).length,
      remainingCount: 0,
    };
    pickingProgress.remainingCount = Math.max(
      pickingProgress.totalCount - pickingProgress.pickedCount,
      0,
    );

    return {
      ...row,
      totalReturnValueKgs: toApiMoneyKgs(row.totalReturnValueKgs),
      salesRevenueKgs: 0,
      profitKgs: 0,
      pickingProgress,
      canEditDraft: canEditBranchHqReturnDraft(row.status),
      items: (row.items ?? []).map((item: any) => ({
        ...item,
        unitCostKgs: toApiMoneyKgs(item.unitCostKgs),
        lineReturnValueKgs: toApiMoneyKgs(item.lineReturnValueKgs),
        fifoAllocations: (item.fifoAllocations ?? []).map((alloc: any) => ({
          ...alloc,
          unitCostKgs: toApiMoneyKgs(alloc.unitCostKgs),
          totalCostKgs: toApiMoneyKgs(alloc.totalCostKgs),
        })),
      })),
      financialAdjustment: row.financialAdjustment
        ? {
            ...row.financialAdjustment,
            acceptedReturnValueKgs: toApiMoneyKgs(row.financialAdjustment.acceptedReturnValueKgs),
            currentDebtKgs: toApiMoneyKgs(row.financialAdjustment.currentDebtKgs),
            suggestedCreditKgs: toApiMoneyKgs(row.financialAdjustment.suggestedCreditKgs),
            appliedCreditKgs: toApiMoneyKgs(row.financialAdjustment.appliedCreditKgs),
            resultingDebtKgs: toApiMoneyKgs(row.financialAdjustment.resultingDebtKgs),
            remainingCreditKgs: toApiMoneyKgs(row.financialAdjustment.remainingCreditKgs),
          }
        : null,
    };
  }
}
