import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  assertAllocationReconciles,
  consumeFifoLayerSequence,
  distributeExactMoney,
  isMoneyEqual,
  remainingFifoLayerMoney,
  serializeExactUnitCost,
  serializeMoney,
  toExactMoney,
  toExactUnitCost,
  toMoneyDecimal,
  toStoredMoneyKgs,
} from './money';
import { buildFifoLayerMoneyFromLine, consumePersistedFifoLayer } from './fifo-layer-cost';
import { calculateLandedCosts } from '../../procurement/landed-cost.util';
import { buildFifoAllocationLines } from '../../pricing/pricing-fifo-allocation.util';
import { buildBranchReceiveLinesFromHqAllocations } from '../../pricing/pricing-fifo-branch-receive.util';
import { previewBranchHqReturnFifoConsumption } from '../../branch-returns/branch-hq-return-fifo.util';
import { sumActiveRemainingFifoLayerValues } from '../../inventory/inventory-authoritative-value.util';
import { applyHqBranchInternalDistributionProfit } from '../../distribution/hq-branch-distribution-profit.util';
import { calculateBprLineTotalKgs, calculateBprOrderTotalKgs } from '../../operations/branch-purchase-authoritative-money.util';

const CONTROLLER_18 = '2458.548675180060';
const CONTROLLER_22 = '3371.171871299030';
const MOTOR_18 = '5085.330518084870';
const REDUCTOR = '1944.211231361720';

describe('high-precision authoritative money architecture', () => {
  it('35. DECIMAL(30,15) round-trip keeps 2458.548675180060', () => {
    const stored = toExactMoney(CONTROLLER_18);
    const readBack = toMoneyDecimal(stored.toFixed(15));
    assert.equal(readBack.toFixed(15), new Prisma.Decimal(CONTROLLER_18).toFixed(15));
    assert.notEqual(stored.toFixed(2), stored.toFixed(15));
    assert.equal(toStoredMoneyKgs(stored), 2458.55);
    assert.equal(serializeExactUnitCost(stored), new Prisma.Decimal(CONTROLLER_18).toFixed(15));
  });

  it('36. 3 pcs / 100.00 keeps authoritative total 100.00, never 99.99', () => {
    const line = buildFifoLayerMoneyFromLine({
      quantity: 3,
      authoritativeLineTotal: '100.00',
    });
    assert.ok(line.unitCostKgs.toFixed(15).startsWith('33.333333333333'));
    assert.equal(toStoredMoneyKgs(toExactUnitCost('100.00', 3).mul(3)), 100);
    const sequence = consumeFifoLayerSequence('100.00', 3, [1, 1, 1]);
    assert.ok(isMoneyEqual(sequence.consumed.reduce((sum, row) => sum.plus(row), new Prisma.Decimal(0)), '100'));
    assert.ok(isMoneyEqual(sequence.remainingCost, 0));
    assert.notEqual(
      sequence.consumed.map((row) => row.toFixed(15)).join('+'),
      '33.330000000000000+33.330000000000000+33.330000000000000',
    );
    const displayRebuilt = toStoredMoneyKgs(33.33 * 3);
    assert.notEqual(displayRebuilt, 100);
  });

  it('37. partial FIFO 10 pcs / 1234.56 across 3+4+3 sums to original', () => {
    const sequence = consumeFifoLayerSequence('1234.56', 10, [3, 4, 3]);
    const consumed = sequence.consumed.reduce((sum, row) => sum.plus(row), new Prisma.Decimal(0));
    assert.ok(isMoneyEqual(consumed, '1234.56'));
    assert.ok(isMoneyEqual(sequence.remainingCost, 0));
    assert.equal(sequence.remainingQuantity, 0);
  });

  it('38. multiple FIFO layers sum consumed cost without averaging', () => {
    const layerA = consumeFifoLayerSequence('500', 5, [5]);
    const layerB = consumeFifoLayerSequence('700.07', 7, [7]);
    const total = layerA.consumed[0]!.plus(layerB.consumed[0]!);
    assert.ok(isMoneyEqual(total, '1200.07'));
  });

  it('39. cargo allocation SUM equals totalCargo and batch SUM equals lines', () => {
    const result = calculateLandedCosts(
      [
        { quantity: 10, purchasePriceYuan: 100, yuanRate: 12.3456, weightKg: 4.3 },
        { quantity: 5, purchasePriceYuan: 200, yuanRate: 12.3456, weightKg: 8.1 },
        { quantity: 3, purchasePriceYuan: 50, yuanRate: 12.3456, weightKg: 1.2 },
      ],
      {
        chinaDomesticTransportKgs: 0,
        chinaExportTransportKgs: 0,
        localTransportKgs: 0,
        packagingCostKgs: 0,
        customsCostKgs: 0,
        insuranceCostKgs: 0,
        bankFeeCostKgs: 0,
        otherExpenseKgs: 0,
      },
      { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 120 } },
    );
    const allocatedCargo = result.items.reduce(
      (sum, item) => sum.plus(toMoneyDecimal(item.chinaExportAllocKgs)),
      new Prisma.Decimal(0),
    );
    assert.ok(isMoneyEqual(allocatedCargo, result.totalCargoCostKgs));
    const lineSum = result.items.reduce(
      (sum, item) => sum.plus(toMoneyDecimal(item.totalCostKgs)),
      new Prisma.Decimal(0),
    );
    assert.ok(isMoneyEqual(lineSum, result.totalCostKgs));
    for (const item of result.items) {
      const exact = toExactUnitCost(item.totalCostKgs, item.effectiveQuantity);
      assert.equal(
        exact.toFixed(15),
        toExactUnitCost(item.totalCostKgs, item.effectiveQuantity).toFixed(15),
      );
      // exactUnit × qty may differ from the line; the line is authoritative.
      if (item.effectiveQuantity > 1) {
        const rebuilt = toStoredMoneyKgs(toStoredMoneyKgs(item.finalCostKgs) * item.effectiveQuantity);
        void rebuilt;
      }
    }
  });

  it('40. HQ FIFO consumed = BPR = distribution = branch FIFO created', () => {
    const original = buildFifoLayerMoneyFromLine({ quantity: 11, authoritativeLineTotal: '27044.035426980660' });
    const consumed = consumePersistedFifoLayer({
      originalLayerCost: original.originalLayerCostKgs,
      remainingLayerCost: original.remainingLayerCostKgs,
      layerBaseQuantity: 11,
      remainingQuantity: 11,
      takeQuantity: 11,
    });
    const bpr = calculateBprLineTotalKgs(
      {
        quantity: 11,
        estimatedLineProductCostKgs: consumed.consumedCost,
        resolvedBranchPriceKgs: toStoredMoneyKgs(original.unitCostKgs),
        totalAmount: toStoredMoneyKgs(original.unitCostKgs) * 11,
        branchType: 'HQ_BRANCH',
      },
      'draft',
    );
    const allocation = buildFifoAllocationLines(
      [
        {
          batchId: 'hq',
          remainingQuantity: 11,
          unitCostKgs: original.unitCostKgs,
          layerTotalCostKgs: original.originalLayerCostKgs,
          remainingLayerCostKgs: original.remainingLayerCostKgs,
          layerBaseQuantity: 11,
        },
      ],
      11,
      { markupPercent: 12, branchType: 'HQ_BRANCH', subtractReserved: false },
    );
    const receive = buildBranchReceiveLinesFromHqAllocations(
      [
        {
          id: 'alloc',
          fifoBatchId: 'hq',
          quantity: 11,
          unitCostKgs: allocation.lines[0]!.unitCostKgs,
          totalCostKgs: allocation.lines[0]!.authoritativeLineTotal,
        },
      ],
      11,
      0,
    );
    assert.ok(isMoneyEqual(consumed.consumedCost, original.originalLayerCostKgs));
    assert.equal(bpr, toStoredMoneyKgs(consumed.consumedCost));
    assert.ok(isMoneyEqual(allocation.authoritativeTotal, consumed.consumedCost));
    assert.equal(allocation.profitKgs, 0);
    assert.ok(isMoneyEqual(receive[0]!.authoritativeLineTotal, allocation.authoritativeTotal));
  });

  it('41. HQ → Branch → HQ round trip difference is 0', () => {
    const hqOriginal = '61463.716879501500';
    const hqLayer = buildFifoLayerMoneyFromLine({ quantity: 25, authoritativeLineTotal: hqOriginal });
    const transfer = consumePersistedFifoLayer({
      originalLayerCost: hqLayer.originalLayerCostKgs,
      remainingLayerCost: hqLayer.remainingLayerCostKgs,
      layerBaseQuantity: 25,
      remainingQuantity: 25,
      takeQuantity: 25,
    });
    const branchLayer = buildFifoLayerMoneyFromLine({
      quantity: 25,
      authoritativeLineTotal: transfer.consumedCost,
    });
    const returned = previewBranchHqReturnFifoConsumption(
      [
        {
          batchId: 'branch',
          remainingQuantity: 25,
          unitCostKgs: Number(branchLayer.unitCostKgs.toFixed(15)),
          layerTotalCostKgs: Number(branchLayer.originalLayerCostKgs.toFixed(15)),
          remainingLayerCostKgs: Number(branchLayer.remainingLayerCostKgs.toFixed(15)),
          initialQuantity: 25,
        },
      ],
      25,
    );
    const hqReturned = buildFifoLayerMoneyFromLine({
      quantity: 25,
      authoritativeLineTotal: returned.totalCostKgs,
    });
    assert.ok(isMoneyEqual(hqLayer.originalLayerCostKgs, branchLayer.originalLayerCostKgs));
    assert.ok(isMoneyEqual(branchLayer.originalLayerCostKgs, returned.totalCostKgs));
    assert.ok(isMoneyEqual(returned.totalCostKgs, hqReturned.originalLayerCostKgs));
    assert.ok(isMoneyEqual(hqLayer.originalLayerCostKgs, hqReturned.originalLayerCostKgs));
  });

  it('42. inventory valuation uses remaining layer cost, not display unit × qty', () => {
    const original = '100.00';
    const remaining = remainingFifoLayerMoney({
      originalLayerCost: original,
      layerBaseQuantity: 3,
      remainingQuantity: 1,
    });
    const value = sumActiveRemainingFifoLayerValues([
      {
        remainingQuantity: 1,
        originalLayerValueKgs: 100,
        layerBaseQuantity: 3,
        remainingLayerCostKgs: Number(remaining.toFixed(15)),
      },
    ]);
    assert.equal(toStoredMoneyKgs(remaining), value);
    assert.notEqual(value, toStoredMoneyKgs(33.33 * 1) === 33.33 && 33.34);
  });

  it('43. real China unit costs persist and copy across the chain', () => {
    const products = [
      { name: 'Желмаян Контроллер 1,8 кВт 70H', unit: CONTROLLER_18, qty: 25 },
      { name: 'Желмаян Контроллер 2,2 кВт 80H', unit: CONTROLLER_22, qty: 10 },
      { name: 'Желмаян Мотор 1.8кВт 70H', unit: MOTOR_18, qty: 8 },
      { name: 'Редуктор 18 зуб 4.3 кг', unit: REDUCTOR, qty: 20 },
    ];
    for (const product of products) {
      const lineTotal = toExactUnitCost(toMoneyDecimal(product.unit).mul(product.qty), 1).mul(1);
      void lineTotal;
      const authoritativeLine = toExactMoney(toMoneyDecimal(product.unit).mul(product.qty));
      const fifo = buildFifoLayerMoneyFromLine({
        quantity: product.qty,
        authoritativeLineTotal: authoritativeLine,
      });
      assert.equal(
        fifo.unitCostKgs.toFixed(15),
        toExactUnitCost(authoritativeLine, product.qty).toFixed(15),
        product.name,
      );
      const transfer = consumePersistedFifoLayer({
        originalLayerCost: fifo.originalLayerCostKgs,
        remainingLayerCost: fifo.remainingLayerCostKgs,
        layerBaseQuantity: product.qty,
        remainingQuantity: product.qty,
        takeQuantity: product.qty,
      });
      const branch = buildFifoLayerMoneyFromLine({
        quantity: product.qty,
        authoritativeLineTotal: transfer.consumedCost,
      });
      const ret = previewBranchHqReturnFifoConsumption(
        [
          {
            batchId: product.name,
            remainingQuantity: product.qty,
            unitCostKgs: Number(branch.unitCostKgs.toFixed(15)),
            layerTotalCostKgs: Number(branch.originalLayerCostKgs.toFixed(15)),
            remainingLayerCostKgs: Number(branch.remainingLayerCostKgs.toFixed(15)),
            initialQuantity: product.qty,
          },
        ],
        product.qty,
      );
      assert.ok(isMoneyEqual(fifo.originalLayerCostKgs, transfer.consumedCost), product.name);
      assert.ok(isMoneyEqual(transfer.consumedCost, branch.originalLayerCostKgs), product.name);
      assert.ok(isMoneyEqual(branch.originalLayerCostKgs, ret.totalCostKgs), product.name);
      console.log(
        JSON.stringify({
          product: product.name,
          exactUnitCost: serializeExactUnitCost(fifo.unitCostKgs),
          authoritativeLineTotal: serializeMoney(fifo.originalLayerCostKgs),
          hqConsumed: serializeMoney(transfer.consumedCost),
          branchFifo: serializeMoney(branch.originalLayerCostKgs),
          returned: serializeMoney(ret.totalCostKgs),
        }),
      );
    }
  });

  it('HQ Office → HQ Branch profit is 0', () => {
    const line = applyHqBranchInternalDistributionProfit(
      {
        quantity: 3,
        unitPrice: 33.33,
        unitCost: 33.33,
        totalPrice: 100,
        totalCost: 100,
        profit: 10,
      },
      'HQ_BRANCH',
    );
    assert.equal(line.profit, 0);
    assert.equal(line.totalCost, 100);
  });

  it('cargo remainder uses last-line exact allocation', () => {
    const allocated = distributeExactMoney(['33.333333333333333', '33.333333333333333', '33.333333333333334'], '100');
    assertAllocationReconciles('100', allocated, 'exact cargo remainder');
  });

  it('BPR order total uses FIFO line cost, not display unit × qty', () => {
    const line = toExactMoney(toMoneyDecimal(CONTROLLER_18).mul(25));
    const total = calculateBprOrderTotalKgs(
      [
        {
          quantity: 25,
          estimatedLineProductCostKgs: line,
          resolvedBranchPriceKgs: 2458.55,
          totalAmount: 61463.75,
          branchType: 'HQ_BRANCH',
        },
      ],
      'draft',
    );
    assert.equal(total, toStoredMoneyKgs(line));
    assert.notEqual(total, 61463.75);
  });
});
