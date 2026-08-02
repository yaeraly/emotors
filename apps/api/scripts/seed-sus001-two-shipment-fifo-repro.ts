/**
 * Local repro fixture for SUS001 / Амортизатор 43×72 (Ø1,5 см):
 * - first China shipment 1,636.13 fully consumed (remainingQuantity = 0)
 * - second China shipment 1,662.97 active
 * - Product catalog snapshots intentionally stale at 309.78
 *
 * Usage: cd apps/api && node --import tsx scripts/seed-sus001-two-shipment-fifo-repro.ts
 */
import {
  BranchType,
  PrismaClient,
  Role,
  StockMovementType,
  WarehouseType,
} from '@prisma/client';
import { roundDisplayMoney } from '../src/pricing/product-cost-precision.util';

const prisma = new PrismaClient();

const FIRST_UNIT = 1636.13;
const SECOND_UNIT = 1662.97;
const FIRST_QTY = 15;
const SECOND_QTY = 12;
const STALE = 309.78;

async function main() {
  let branch = await prisma.branch.findFirst({ where: { code: 'EMOTORS-HQ' } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        code: 'EMOTORS-HQ',
        name: 'EMOTORS HQ',
        branchType: BranchType.HQ_BRANCH,
        ownerName: 'HQ',
        city: 'Bishkek',
      },
    });
  }

  let wh = await prisma.warehouse.findFirst({
    where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
  });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: {
        branchId: branch.id,
        name: 'HQ Warehouse',
        code: 'HQ-MAIN',
        warehouseType: WarehouseType.HQ,
        isActive: true,
      },
    });
  }

  let cat = await prisma.productCategory.findFirst({ where: { isActive: true } });
  if (!cat) {
    cat = await prisma.productCategory.create({
      data: {
        code: 'SUS',
        nameKy: 'Асма',
        nameRu: 'Подвеска',
        nameEn: 'Suspension',
        isActive: true,
      },
    });
  }

  let user = await prisma.user.findFirst({ where: { deletedAt: null } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'fifo-repair@example.com',
        fullName: 'FIFO Repair',
        passwordHash: 'x',
        role: Role.CEO,
        roles: [Role.CEO],
      },
    });
  }

  let product = await prisma.product.findFirst({
    where: { sku: 'SUS001', deletedAt: null },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        branchId: branch.id,
        warehouseId: wh.id,
        categoryId: cat.id,
        name: 'Амортизатор 43×72 (Ø1,5 см)',
        sku: 'SUS001',
        category: 'SUS',
        unit: 'pcs',
        purchasePriceYuan: 220,
        latestYuanRate: 1.4081,
        purchaseCostKgs: STALE,
        transportCostKgs: 0,
        costPriceKgs: STALE,
        finalCostKgs: STALE,
        isActive: true,
      },
    });
  } else {
    product = await prisma.product.update({
      where: { id: product.id },
      data: {
        name: 'Амортизатор 43×72 (Ø1,5 см)',
        purchaseCostKgs: STALE,
        costPriceKgs: STALE,
        finalCostKgs: STALE,
      },
    });
  }

  await prisma.fifoInventoryBatch.deleteMany({ where: { productId: product.id } });
  await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
  await prisma.inventoryBalance.deleteMany({ where: { productId: product.id } });

  const m1 = await prisma.stockMovement.create({
    data: {
      branchId: branch.id,
      warehouseId: wh.id,
      productId: product.id,
      type: StockMovementType.IN,
      quantity: FIRST_QTY,
      unitCostKgs: FIRST_UNIT,
      totalCostKgs: roundDisplayMoney(FIRST_UNIT * FIRST_QTY),
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      referenceId: 'sus001-recv-1',
      createdById: user.id,
      note: 'China shipment 1',
    },
  });
  const m2 = await prisma.stockMovement.create({
    data: {
      branchId: branch.id,
      warehouseId: wh.id,
      productId: product.id,
      type: StockMovementType.IN,
      quantity: SECOND_QTY,
      unitCostKgs: SECOND_UNIT,
      totalCostKgs: roundDisplayMoney(SECOND_UNIT * SECOND_QTY),
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      referenceId: 'sus001-recv-2',
      createdById: user.id,
      note: 'China shipment 2',
    },
  });

  const b1 = await prisma.fifoInventoryBatch.create({
    data: {
      productId: product.id,
      warehouseId: wh.id,
      initialQuantity: FIRST_QTY,
      remainingQuantity: 0,
      reservedQuantity: 0,
      unitCostKgs: FIRST_UNIT,
      receivedAt: new Date('2026-01-10T10:00:00Z'),
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      referenceId: 'sus001-recv-1',
      stockMovementId: m1.id,
    },
  });
  const b2 = await prisma.fifoInventoryBatch.create({
    data: {
      productId: product.id,
      warehouseId: wh.id,
      initialQuantity: SECOND_QTY,
      remainingQuantity: SECOND_QTY,
      reservedQuantity: 0,
      unitCostKgs: SECOND_UNIT,
      receivedAt: new Date('2026-02-20T10:00:00Z'),
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      referenceId: 'sus001-recv-2',
      stockMovementId: m2.id,
    },
  });

  await prisma.inventoryBalance.create({
    data: {
      branchId: branch.id,
      warehouseId: wh.id,
      productId: product.id,
      quantity: SECOND_QTY,
      averageCostKgs: STALE,
      landedCostKgs: STALE,
      totalValueKgs: roundDisplayMoney(STALE * SECOND_QTY),
    },
  });

  console.log(
    JSON.stringify(
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        firstLayerId: b1.id,
        secondLayerId: b2.id,
        staleFinalCostKgs: STALE,
        correctActiveCostKgs: SECOND_UNIT,
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
