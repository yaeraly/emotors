/**
 * Branch receiving integration tests (A–G) via HTTP API.
 * Requires API running on PORT 3001 and DATABASE_URL configured.
 * Run: npm run test:receiving -w @emotors/api
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  BranchDistributionOrderStatus,
  PrismaClient,
  Role,
  WarehouseType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const API = process.env.API_URL ?? 'http://localhost:3001';

type TestContext = {
  branchId: string;
  hqWarehouseId: string;
  branchWarehouseId: string;
  otherBranchWarehouseId: string;
  operatorEmail: string;
  otherOperatorEmail: string;
  operatorPassword: string;
  hqBranchId: string;
  categoryId: string;
};

let ctx: TestContext;

async function login(email: string, password: string) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { accessToken?: string; message?: string };
  assert.equal(response.status, 201, `login failed for ${email}: ${body.message ?? JSON.stringify(body)}`);
  return body.accessToken!;
}

async function saveDraftViaApi(
  token: string,
  orderId: string,
  itemId: string,
  payload: {
    acceptedQuantity: number;
    damagedQuantity?: number;
    missingQuantity?: number;
    note?: string;
  },
) {
  const response = await fetch(
    `${API}/distribution/orders/${orderId}/receiving-draft-rows/${itemId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        damagedQuantity: 0,
        ...payload,
      }),
    },
  );
  const body = await response.json();
  return { status: response.status, body };
}

async function receiveViaApi(
  token: string,
  orderId: string,
  warehouseId: string,
  items: Array<{
    shipmentItemId: string;
    acceptedQuantity: number;
    damagedQuantity?: number;
    missingQuantity?: number;
    note?: string;
  }>,
) {
  for (const item of items) {
    const draftResult = await saveDraftViaApi(token, orderId, item.shipmentItemId, {
      acceptedQuantity: item.acceptedQuantity,
      damagedQuantity: item.damagedQuantity ?? 0,
      missingQuantity: item.missingQuantity,
      note: item.note,
    });
    assert.ok([200, 201].includes(draftResult.status), JSON.stringify(draftResult.body));
  }

  const allocateResponse = await fetch(`${API}/distribution/orders/${orderId}/transport-cost/allocate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      transportCostKgs: 0,
    }),
  });
  const allocateBody = await allocateResponse.json();
  assert.ok([200, 201].includes(allocateResponse.status), JSON.stringify(allocateBody));

  const response = await fetch(`${API}/distribution/orders/${orderId}/receive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      warehouseId,
    }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function createShippedOrder(sku: string, quantity = 3) {
  const ceo = await prisma.user.findUniqueOrThrow({ where: { email: 'ceo@emotors.kg' } });
  const hqProduct = await prisma.product.create({
    data: {
      branchId: ctx.hqBranchId,
      warehouseId: ctx.hqWarehouseId,
      categoryId: ctx.categoryId,
      category: 'MOTORS',
      name: `Integration ${sku}`,
      sku,
      unit: 'pcs',
      weightKg: 1.5,
      purchaseCostKgs: 50,
      finalCostKgs: 55,
      costPriceKgs: 55,
      sellingPriceKgs: 80,
      wholesalePriceKgs: 70,
      hqBranchWholesalePriceKgs: 65,
      isActive: true,
    },
  });
  await prisma.inventoryBalance.upsert({
    where: {
      branchId_warehouseId_productId: {
        branchId: ctx.hqBranchId,
        warehouseId: ctx.hqWarehouseId,
        productId: hqProduct.id,
      },
    },
    update: { quantity: 100 },
    create: {
      branchId: ctx.hqBranchId,
      warehouseId: ctx.hqWarehouseId,
      productId: hqProduct.id,
      quantity: 100,
      averageCostKgs: 55,
      totalValueKgs: 5500,
    },
  });

  return prisma.branchDistributionOrder.create({
    data: {
      orderNumber: `BDO-INT-${sku}-${Date.now()}`,
      branchId: ctx.branchId,
      sourceWarehouseId: ctx.hqWarehouseId,
      destinationWarehouseId: ctx.branchWarehouseId,
      status: BranchDistributionOrderStatus.SHIPPED,
      totalAmount: quantity * 70,
      totalCost: quantity * 55,
      totalProfit: quantity * 15,
      sentAt: new Date(),
      createdById: ceo.id,
      items: {
        create: [
          {
            productId: hqProduct.id,
            sku,
            productName: `Integration ${sku}`,
            quantity,
            dispatchedQuantity: quantity,
            unitCost: 55,
            unitPrice: 70,
            totalCost: quantity * 55,
            totalPrice: quantity * 70,
            profit: quantity * 15,
            unitWeightKgSnapshot: 1.5,
            lineWeightKgSnapshot: 1.5 * quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
}

before(async () => {
  const health = await fetch(`${API}/auth/me`).catch(() => null);
  assert.ok(health, 'API must be running on localhost:3001');

  const branch = await prisma.branch.findUniqueOrThrow({ where: { code: 'BISHKEK' } });
  const otherBranch = await prisma.branch.findUniqueOrThrow({ where: { code: 'OSH' } });
  const hqBranch = await prisma.branch.findUniqueOrThrow({ where: { code: 'EMOTORS-HQ' } });
  const hqWarehouse = await prisma.warehouse.findFirstOrThrow({
    where: { code: 'HQ-MAIN', warehouseType: WarehouseType.HQ },
  });
  const category = await prisma.productCategory.findFirstOrThrow({ where: { code: 'MOTORS' } });
  const passwordHash = await bcrypt.hash('Emotors@2026', 12);

  async function ensureBranchWarehouse(branchId: string, code: string) {
    const existing = await prisma.warehouse.findFirst({
      where: { branchId, warehouseType: WarehouseType.BRANCH, isActive: true },
    });
    if (existing) return existing;
    return prisma.warehouse.create({
      data: {
        branchId,
        warehouseType: WarehouseType.BRANCH,
        name: `${code} Warehouse`,
        code: `${code}-WH-INT`,
        address: code,
        city: code,
        country: 'Kyrgyzstan',
        isActive: true,
      },
    });
  }

  const branchWarehouse = await ensureBranchWarehouse(branch.id, 'BISHKEK');
  const otherBranchWarehouse = await ensureBranchWarehouse(otherBranch.id, 'OSH');

  async function ensureOperator(email: string, branchId: string, employeeId: string, phone: string) {
    await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: Role.WAREHOUSE_OPERATOR,
        branchId,
        phone,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
      create: {
        email,
        passwordHash,
        fullName: `Operator ${email}`,
        role: Role.WAREHOUSE_OPERATOR,
        branchId,
        employeeId,
        phone,
        username: email.split('@')[0],
        status: 'ACTIVE',
        mustChangePassword: false,
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const role = await prisma.rbacRole.findUniqueOrThrow({ where: { code: 'WAREHOUSE_OPERATOR' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  await ensureOperator('branch-wh-int@emotors.kg', branch.id, 'BR-WH-INT-1', '+996700000201');
  await ensureOperator('branch-wh-osh@emotors.kg', otherBranch.id, 'BR-WH-INT-2', '+996700000202');

  ctx = {
    branchId: branch.id,
    hqWarehouseId: hqWarehouse.id,
    branchWarehouseId: branchWarehouse.id,
    otherBranchWarehouseId: otherBranchWarehouse.id,
    operatorEmail: 'branch-wh-int@emotors.kg',
    otherOperatorEmail: 'branch-wh-osh@emotors.kg',
    operatorPassword: 'Emotors@2026',
    hqBranchId: hqBranch.id,
    categoryId: category.id,
  };
});

after(async () => {
  await prisma.$disconnect();
});

describe('Branch receiving integration', () => {
  it('A — first receipt into branch creates stock automatically', async () => {
    const sku = `INT-A-${Date.now()}`;
    const order = await createShippedOrder(sku);
    const item = order.items[0]!;
    const token = await login(ctx.operatorEmail, ctx.operatorPassword);

    const result = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: item.id, acceptedQuantity: item.quantity },
    ]);
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.body));

    const balance = await prisma.inventoryBalance.findFirst({
      where: {
        branchId: ctx.branchId,
        warehouseId: ctx.branchWarehouseId,
        product: { sku },
      },
    });
    assert.ok(balance);
    assert.equal(balance.quantity, item.quantity);
  });

  it('B — resolves product from shipment item, not shipment item id as product id', async () => {
    const sku = `INT-B-${Date.now()}`;
    const order = await createShippedOrder(sku);
    const item = order.items[0]!;
    const token = await login(ctx.operatorEmail, ctx.operatorPassword);

    const result = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: item.id, acceptedQuantity: item.quantity },
    ]);
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.body));

    const movement = await prisma.stockMovement.findFirst({
      where: { referenceType: 'GOODS_RECEIVING_ITEM', referenceId: item.id },
    });
    assert.ok(movement);
    assert.notEqual(movement.productId, item.id);
  });

  it('C — legacy shipment item repairs via SKU when stored product reference is inactive', async () => {
    const sku = `INT-C-${Date.now()}`;
    const staleProduct = await prisma.product.create({
      data: {
        branchId: ctx.hqBranchId,
        warehouseId: ctx.hqWarehouseId,
        categoryId: ctx.categoryId,
        category: 'MOTORS',
        name: `Stale ${sku}`,
        sku: `${sku}-OLD`,
        unit: 'pcs',
        weightKg: 1,
        finalCostKgs: 40,
        costPriceKgs: 40,
        sellingPriceKgs: 60,
        wholesalePriceKgs: 50,
        hqBranchWholesalePriceKgs: 45,
        isActive: false,
        deletedAt: new Date(),
      },
    });
    const hqProduct = await prisma.product.create({
      data: {
        branchId: ctx.hqBranchId,
        warehouseId: ctx.hqWarehouseId,
        categoryId: ctx.categoryId,
        category: 'MOTORS',
        name: `Legacy ${sku}`,
        sku,
        unit: 'pcs',
        weightKg: 1,
        finalCostKgs: 40,
        costPriceKgs: 40,
        sellingPriceKgs: 60,
        wholesalePriceKgs: 50,
        hqBranchWholesalePriceKgs: 45,
        isActive: true,
      },
    });
    const ceo = await prisma.user.findUniqueOrThrow({ where: { email: 'ceo@emotors.kg' } });
    const order = await prisma.branchDistributionOrder.create({
      data: {
        orderNumber: `BDO-LEG-${Date.now()}`,
        branchId: ctx.branchId,
        sourceWarehouseId: ctx.hqWarehouseId,
        destinationWarehouseId: ctx.branchWarehouseId,
        status: BranchDistributionOrderStatus.SHIPPED,
        totalAmount: 50,
        totalCost: 40,
        totalProfit: 10,
        sentAt: new Date(),
        createdById: ceo.id,
        items: {
          create: [
            {
              productId: staleProduct.id,
              sku,
              productName: hqProduct.name,
              quantity: 1,
              dispatchedQuantity: 1,
              unitCost: 40,
              unitPrice: 50,
              totalCost: 40,
              totalPrice: 50,
              profit: 10,
              unitWeightKgSnapshot: 1,
              lineWeightKgSnapshot: 1,
            },
          ],
        },
      },
      include: { items: true },
    });
    const token = await login(ctx.operatorEmail, ctx.operatorPassword);
    const result = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: order.items[0]!.id, acceptedQuantity: 1 },
    ]);
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.body));

    const repaired = await prisma.branchDistributionOrderItem.findUniqueOrThrow({
      where: { id: order.items[0]!.id },
    });
    assert.equal(repaired.productId, hqProduct.id);
  });

  it('D — receiving succeeds without product cost in response', async () => {
    const sku = `INT-D-${Date.now()}`;
    const order = await createShippedOrder(sku);
    const item = order.items[0]!;
    const token = await login(ctx.operatorEmail, ctx.operatorPassword);

    const result = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: item.id, acceptedQuantity: item.quantity },
    ]);
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.body));
    const receivingItem = result.body?.receiving?.items?.[0];
    assert.equal(receivingItem?.unitCost, undefined);
  });

  it('E — duplicate receiving does not double stock', async () => {
    const sku = `INT-E-${Date.now()}`;
    const order = await createShippedOrder(sku);
    const item = order.items[0]!;
    const token = await login(ctx.operatorEmail, ctx.operatorPassword);

    const first = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: item.id, acceptedQuantity: item.quantity },
    ]);
    assert.ok([200, 201].includes(first.status), JSON.stringify(first.body));

    const second = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: item.id, acceptedQuantity: item.quantity },
    ]);
    assert.equal(second.status, 400);
    assert.match(String(second.body?.message ?? ''), /already been received/i);

    const movements = await prisma.stockMovement.count({
      where: { referenceType: 'GOODS_RECEIVING_ITEM', referenceId: item.id },
    });
    assert.equal(movements, 1);
  });

  it('F — branch isolation denies cross-branch receipt', async () => {
    const sku = `INT-F-${Date.now()}`;
    const order = await createShippedOrder(sku);
    const item = order.items[0]!;
    const token = await login(ctx.otherOperatorEmail, ctx.operatorPassword);

    const result = await receiveViaApi(token, order.id, ctx.otherBranchWarehouseId, [
      { shipmentItemId: item.id, acceptedQuantity: item.quantity },
    ]);
    assert.ok([403, 400].includes(result.status), JSON.stringify(result.body));

    const movement = await prisma.stockMovement.findFirst({
      where: { referenceType: 'GOODS_RECEIVING_ITEM', referenceId: item.id },
    });
    assert.equal(movement, null);
  });

  it('G — rollback when one item has broken product relation', async () => {
    const skuGood = `INT-G-GOOD-${Date.now()}`;
    const skuBad = `INT-G-BAD-${Date.now()}`;
    const ceo = await prisma.user.findUniqueOrThrow({ where: { email: 'ceo@emotors.kg' } });
    const goodProduct = await prisma.product.create({
      data: {
        branchId: ctx.hqBranchId,
        warehouseId: ctx.hqWarehouseId,
        categoryId: ctx.categoryId,
        category: 'MOTORS',
        name: 'Good product',
        sku: skuGood,
        unit: 'pcs',
        weightKg: 1,
        finalCostKgs: 10,
        costPriceKgs: 10,
        sellingPriceKgs: 15,
        wholesalePriceKgs: 12,
        hqBranchWholesalePriceKgs: 11,
        isActive: true,
      },
    });
    const staleBadProduct = await prisma.product.create({
      data: {
        branchId: ctx.hqBranchId,
        warehouseId: ctx.hqWarehouseId,
        categoryId: ctx.categoryId,
        category: 'MOTORS',
        name: 'Stale bad',
        sku: `${skuBad}-OLD`,
        unit: 'pcs',
        weightKg: 1,
        finalCostKgs: 10,
        costPriceKgs: 10,
        sellingPriceKgs: 15,
        wholesalePriceKgs: 12,
        hqBranchWholesalePriceKgs: 11,
        isActive: false,
        deletedAt: new Date(),
      },
    });

    const order = await prisma.branchDistributionOrder.create({
      data: {
        orderNumber: `BDO-ROLL-${Date.now()}`,
        branchId: ctx.branchId,
        sourceWarehouseId: ctx.hqWarehouseId,
        destinationWarehouseId: ctx.branchWarehouseId,
        status: BranchDistributionOrderStatus.SHIPPED,
        totalAmount: 24,
        totalCost: 20,
        totalProfit: 4,
        sentAt: new Date(),
        createdById: ceo.id,
        items: {
          create: [
            {
              productId: goodProduct.id,
              sku: skuGood,
              productName: 'Good',
              quantity: 2,
              dispatchedQuantity: 2,
              unitCost: 10,
              unitPrice: 12,
              totalCost: 20,
              totalPrice: 24,
              profit: 4,
              unitWeightKgSnapshot: 1,
              lineWeightKgSnapshot: 2,
            },
            {
              productId: staleBadProduct.id,
              sku: 'NONEXISTENT-SKU-XYZ-ROLLBACK',
              productName: 'Bad',
              quantity: 1,
              dispatchedQuantity: 1,
              unitCost: 10,
              unitPrice: 12,
              totalCost: 10,
              totalPrice: 12,
              profit: 2,
              unitWeightKgSnapshot: 1,
              lineWeightKgSnapshot: 1,
            },
          ],
        },
      },
      include: { items: true },
    });

    const token = await login(ctx.operatorEmail, ctx.operatorPassword);
    const goodItem = order.items.find((row) => row.sku === skuGood)!;
    const badItem = order.items.find((row) => row.productName === 'Bad')!;
    const result = await receiveViaApi(token, order.id, ctx.branchWarehouseId, [
      { shipmentItemId: goodItem.id, acceptedQuantity: goodItem.quantity },
      { shipmentItemId: badItem.id, acceptedQuantity: badItem.quantity },
    ]);
    assert.ok(result.status >= 400, JSON.stringify(result.body));

    const goodMovement = await prisma.stockMovement.findFirst({
      where: { referenceType: 'GOODS_RECEIVING_ITEM', referenceId: goodItem.id },
    });
    assert.equal(goodMovement, null);
  });
});
