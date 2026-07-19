/**
 * Integration script: reproduce Branch Warehouse receiving flow.
 * Run: npx ts-node prisma/scripts/test-branch-receiving.ts
 */
import {
  BranchDistributionOrderStatus,
  PrismaClient,
  Role,
  StockMovementType,
  WarehouseType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { code: 'BISHKEK' } });
  const hqBranch = await prisma.branch.findUniqueOrThrow({ where: { code: 'EMOTORS-HQ' } });
  const hqWarehouse = await prisma.warehouse.findFirstOrThrow({
    where: { code: 'HQ-MAIN', warehouseType: WarehouseType.HQ },
  });

  let branchWarehouse = await prisma.warehouse.findFirst({
    where: { branchId: branch.id, warehouseType: WarehouseType.BRANCH, isActive: true },
  });
  if (!branchWarehouse) {
    branchWarehouse = await prisma.warehouse.create({
      data: {
        branchId: branch.id,
        warehouseType: WarehouseType.BRANCH,
        name: 'Bishkek Branch Warehouse',
        code: 'BISHKEK-WH',
        address: branch.city ?? 'Bishkek',
        city: 'Bishkek',
        country: 'Kyrgyzstan',
        isActive: true,
      },
    });
    console.log('Created branch warehouse:', branchWarehouse.id);
  }

  const passwordHash = await bcrypt.hash('Emotors@2026', 12);
  const operator = await prisma.user.upsert({
    where: { email: 'branch-wh@emotors.kg' },
    update: {
      passwordHash,
      fullName: 'Branch Warehouse Operator',
      role: Role.WAREHOUSE_OPERATOR,
      branchId: branch.id,
      employeeId: 'BR-WH-001',
      phone: '+996700000099',
      username: 'branch-wh',
      status: 'ACTIVE',
      mustChangePassword: false,
    },
    create: {
      email: 'branch-wh@emotors.kg',
      passwordHash,
      fullName: 'Branch Warehouse Operator',
      role: Role.WAREHOUSE_OPERATOR,
      branchId: branch.id,
      employeeId: 'BR-WH-001',
      phone: '+996700000099',
      username: 'branch-wh',
      status: 'ACTIVE',
      mustChangePassword: false,
    },
  });

  const operatorRole = await prisma.rbacRole.findUniqueOrThrow({ where: { code: 'WAREHOUSE_OPERATOR' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: operator.id, roleId: operatorRole.id } },
    update: {},
    create: { userId: operator.id, roleId: operatorRole.id },
  });

  const category = await prisma.productCategory.findFirstOrThrow({ where: { code: 'MOTORS' } });
  const sku = `TEST-RECV-${Date.now().toString().slice(-6)}`;

  const hqProduct = await prisma.product.create({
    data: {
      branchId: hqBranch.id,
      warehouseId: hqWarehouse.id,
      categoryId: category.id,
      category: category.nameRu,
      name: `Receiving Test Motor ${sku}`,
      sku,
      unit: 'pcs',
      weightKg: 2.5,
      purchaseCostKgs: 100,
      transportCostKgs: 10,
      finalCostKgs: 110,
      costPriceKgs: 110,
      sellingPriceKgs: 150,
      wholesalePriceKgs: 130,
      hqBranchWholesalePriceKgs: 125,
      minStockLevel: 0,
      isActive: true,
    },
  });

  await prisma.inventoryBalance.upsert({
    where: {
      branchId_warehouseId_productId: {
        branchId: hqBranch.id,
        warehouseId: hqWarehouse.id,
        productId: hqProduct.id,
      },
    },
    update: { quantity: 100, averageCostKgs: 110, totalValueKgs: 11000 },
    create: {
      branchId: hqBranch.id,
      warehouseId: hqWarehouse.id,
      productId: hqProduct.id,
      quantity: 100,
      averageCostKgs: 110,
      totalValueKgs: 11000,
    },
  });

  const ceo = await prisma.user.findUniqueOrThrow({ where: { email: 'ceo@emotors.kg' } });
  const qty = 5;

  const order = await prisma.branchDistributionOrder.create({
    data: {
      orderNumber: `BDO-TEST-${Date.now()}`,
      branchId: branch.id,
      sourceWarehouseId: hqWarehouse.id,
      destinationWarehouseId: branchWarehouse.id,
      status: BranchDistributionOrderStatus.SHIPPED,
      totalAmount: qty * 130,
      totalCost: qty * 110,
      totalProfit: qty * 20,
      sentAt: new Date(),
      createdById: ceo.id,
      items: {
        create: [
          {
            productId: hqProduct.id,
            sku: hqProduct.sku,
            productName: hqProduct.name,
            quantity: qty,
            dispatchedQuantity: qty,
            unitCost: 110,
            unitPrice: 130,
            totalCost: qty * 110,
            totalPrice: qty * 130,
            profit: qty * 20,
            unitWeightKgSnapshot: 2.5,
            lineWeightKgSnapshot: 2.5 * qty,
          },
        ],
      },
    },
    include: { items: true },
  });

  const branchStockBefore = await prisma.inventoryBalance.findFirst({
    where: {
      branchId: branch.id,
      warehouseId: branchWarehouse.id,
      product: { sku: hqProduct.sku },
    },
  });

  console.log(
    JSON.stringify(
      {
        operatorEmail: operator.email,
        operatorPassword: 'Emotors@2026',
        branchId: branch.id,
        branchWarehouseId: branchWarehouse.id,
        hqProductId: hqProduct.id,
        sku: hqProduct.sku,
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipmentItemId: order.items[0]!.id,
        dispatchedQuantity: qty,
        branchStockBefore: branchStockBefore?.quantity ?? 0,
        receivePayload: {
          warehouseId: branchWarehouse.id,
          items: [
            {
              shipmentItemId: order.items[0]!.id,
              acceptedQuantity: qty,
              damagedQuantity: 0,
              missingQuantity: 0,
            },
          ],
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
