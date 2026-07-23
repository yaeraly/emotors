import { PrismaClient, WarehouseType, StockMovementType, BranchType } from '@prisma/client';
import { resolveUnitCostFromInventoryLayer } from '../src/pricing/pricing-fifo-unit-cost.util';

const p = new PrismaClient();

async function main() {
  let hqBranch = await p.branch.findFirst({ where: { code: 'EMOTORS-HQ' } });
  if (!hqBranch) {
    hqBranch = await p.branch.create({
      data: {
        code: 'EMOTORS-HQ',
        name: 'HQ Catalog',
        branchType: BranchType.HQ_BRANCH,
        ownerName: 'HQ',
        city: 'Bishkek',
        isActive: true,
      },
    });
  }

  let wh = await p.warehouse.findFirst({ where: { warehouseType: WarehouseType.HQ, deletedAt: null } });
  if (!wh) {
    wh = await p.warehouse.create({
      data: {
        name: 'HQ Main',
        code: 'HQ-MAIN',
        warehouseType: WarehouseType.HQ,
        city: 'Bishkek',
        isActive: true,
      },
    });
  }

  let cat = await p.productCategory.findFirst({ where: { isActive: true } });
  if (!cat) {
    cat = await p.productCategory.create({
      data: { code: 'SUS', nameKy: 'Сусп', nameRu: 'Подвеска', nameEn: 'Suspension', isActive: true },
    });
  }

  let user = await p.user.findFirst();
  if (!user) {
    user = await p.user.create({
      data: {
        email: 'ceo@test.local',
        fullName: 'CEO',
        passwordHash: 'x',
        role: 'CEO',
        isActive: true,
      },
    });
  }

  const existing = await p.product.findFirst({ where: { sku: 'SUS001', deletedAt: null } });
  if (existing) {
    await p.distributionFifoAllocation.deleteMany({ where: { productId: existing.id } });
    await p.saleFifoAllocation.deleteMany({ where: { productId: existing.id } });
    await p.fifoInventoryBatch.deleteMany({ where: { productId: existing.id } });
    await p.stockMovement.deleteMany({ where: { productId: existing.id } });
    await p.inventoryBalance.deleteMany({ where: { productId: existing.id } });
    await p.product.delete({ where: { id: existing.id } });
  }

  const product = await p.product.create({
    data: {
      branchId: hqBranch.id,
      warehouseId: wh.id,
      categoryId: cat.id,
      name: 'Амортизатор 43×72 (Ø1,5 см)',
      sku: 'SUS001',
      category: 'SUS',
      unit: 'шт',
      finalCostKgs: 445.88,
      costPriceKgs: 445.88,
      purchaseCostKgs: 400,
      transportCostKgs: 45.88,
      sellingPriceKgs: 600,
      isActive: true,
    },
  });

  const m1 = await p.stockMovement.create({
    data: {
      branchId: hqBranch.id,
      warehouseId: wh.id,
      productId: product.id,
      type: StockMovementType.IN,
      quantity: 80,
      unitCostKgs: 350,
      totalCostKgs: 28000,
      status: 'ACTIVE',
      referenceType: 'SEED_REPRO',
      referenceId: 'seed-recv-1',
      createdById: user.id,
      createdAt: new Date('2026-01-10T10:00:00Z'),
    },
  });
  const m2 = await p.stockMovement.create({
    data: {
      branchId: hqBranch.id,
      warehouseId: wh.id,
      productId: product.id,
      type: StockMovementType.IN,
      quantity: 120,
      unitCostKgs: 445.88,
      totalCostKgs: 53505.6,
      status: 'ACTIVE',
      referenceType: 'SEED_REPRO',
      referenceId: 'seed-recv-2',
      createdById: user.id,
      createdAt: new Date('2026-02-15T10:00:00Z'),
    },
  });

  await p.fifoInventoryBatch.create({
    data: {
      productId: product.id,
      warehouseId: wh.id,
      stockMovementId: m1.id,
      receivedAt: m1.createdAt,
      unitCostKgs: 350,
      initialQuantity: 80,
      remainingQuantity: 80,
      referenceType: m1.referenceType,
      referenceId: m1.referenceId,
    },
  });
  await p.fifoInventoryBatch.create({
    data: {
      productId: product.id,
      warehouseId: wh.id,
      stockMovementId: m2.id,
      receivedAt: m2.createdAt,
      unitCostKgs: 445.88,
      initialQuantity: 120,
      remainingQuantity: 120,
      referenceType: m2.referenceType,
      referenceId: m2.referenceId,
    },
  });

  const avg = Math.round(((80 * 350 + 120 * 445.88) / 200 + Number.EPSILON) * 100) / 100;
  await p.inventoryBalance.create({
    data: {
      branchId: hqBranch.id,
      warehouseId: wh.id,
      productId: product.id,
      quantity: 200,
      averageCostKgs: avg,
      landedCostKgs: 445.88,
      totalValueKgs: 80 * 350 + 120 * 445.88,
      lastReceivingAt: m2.createdAt,
    },
  });

  await p.product.update({
    where: { id: product.id },
    data: { costPriceKgs: avg },
  });

  console.log(
    JSON.stringify(
      {
        productId: product.id,
        inventoryAverageCostKgs: avg,
        layer1Unit: 350,
        layer2Unit: 445.88,
        productCostPriceKgsStored: avg,
        formula: '(80*350 + 120*445.88) / 200',
      },
      null,
      2,
    ),
  );

  const batches = await p.fifoInventoryBatch.findMany({
    where: { productId: product.id, remainingQuantity: { gt: 0 } },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  const active = batches[0];
  const movementId = active.stockMovementId as string;
  const movement = await p.stockMovement.findUnique({ where: { id: movementId } });
  const unit = resolveUnitCostFromInventoryLayer({
    quantity: active.initialQuantity,
    unitCostKgs: Number(movement?.unitCostKgs ?? 0),
    totalCostKgs: Number(movement?.totalCostKgs ?? 0),
  });
  console.log(
    JSON.stringify(
      {
        activeBatchId: active.id,
        activeUnitFromFifo: unit,
        incorrectlyWouldShowIfUsingAverage: avg,
        incorrectlyWouldShowIfUsingProductCostPrice: avg,
        fixWorks: unit === 350 && avg === 407.53,
      },
      null,
      2,
    ),
  );

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
