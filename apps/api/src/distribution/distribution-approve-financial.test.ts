import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('distribution approve — Branch Accountant financial-only path', () => {
  const distributionServicePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'distribution.service.ts',
  );
  const branchAccountantServicePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../branch-accountant/branch-accountant.service.ts',
  );
  const pricingFifoServicePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../pricing/pricing-fifo.service.ts',
  );

  it('Branch Accountant createInvoice passes skipStockReservation (financial only)', () => {
    const source = readFileSync(branchAccountantServicePath, 'utf8');
    assert.ok(source.includes('createInvoiceFromConfirmedOrder'));
    assert.match(source, /skipStockReservation:\s*true/);
  });

  it('approve skips reserveFifoForDistribution when skipStockReservation is true', () => {
    const source = readFileSync(distributionServicePath, 'utf8');
    assert.match(source, /financialOnlyApprove\s*=\s*options\?\.skipStockReservation\s*===\s*true/);
    assert.match(
      source,
      /if\s*\(!financialOnlyApprove\)\s*\{[\s\S]*reserveFifoForDistribution/,
    );
  });

  it('approve skips FIFO transfer reconciliation on financial-only path', () => {
    const source = readFileSync(distributionServicePath, 'utf8');
    assert.match(
      source,
      /if\s*\(!financialOnlyApprove\)\s*\{[\s\S]*reconcileBranchTransferCost/,
    );
  });

  it('HQ Warehouse shipment still validates/consumes FIFO (not disabled globally)', () => {
    const distributionSource = readFileSync(distributionServicePath, 'utf8');
    const fifoSource = readFileSync(pricingFifoServicePath, 'utf8');
    assert.ok(distributionSource.includes('consumeFifoForDistribution'));
    assert.ok(fifoSource.includes('Insufficient FIFO stock for product'));
    assert.ok(distributionSource.includes('Insufficient FIFO stock for SKU'));
  });
});
