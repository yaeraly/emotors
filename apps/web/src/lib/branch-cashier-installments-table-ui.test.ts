import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  BRANCH_CASHIER_INSTALLMENTS_INVOICE_NO_WIDTH_PX,
  BRANCH_CASHIER_INSTALLMENTS_RECEIPT_WIDTH_PX,
  BRANCH_CASHIER_INSTALLMENTS_STANDARD_INVOICE_NO,
  BRANCH_CASHIER_INSTALLMENTS_STANDARD_RECEIPT,
  branchCashierInstallmentsColumnWidthClass,
  branchCashierInstallmentsTruncatedCellClass,
  branchCashierInstallmentsTruncatedCellProps,
  branchCashierInstallmentsTruncatedTooltip,
} from './branch-cashier-installments-table-ui';

describe('branch cashier installments table ui', () => {
  it('uses invoice and receipt widths within the suggested desktop range', () => {
    assert.ok(BRANCH_CASHIER_INSTALLMENTS_INVOICE_NO_WIDTH_PX >= 90);
    assert.ok(BRANCH_CASHIER_INSTALLMENTS_INVOICE_NO_WIDTH_PX <= 110);
    assert.ok(BRANCH_CASHIER_INSTALLMENTS_RECEIPT_WIDTH_PX >= 145);
    assert.ok(BRANCH_CASHIER_INSTALLMENTS_RECEIPT_WIDTH_PX <= 170);
  });

  it('maps column keys to fixed width classes', () => {
    assert.equal(branchCashierInstallmentsColumnWidthClass('invoiceNo'), 'w-[100px]');
    assert.equal(branchCashierInstallmentsColumnWidthClass('receipt'), 'w-[160px]');
  });

  it('applies nowrap ellipsis cell styles', () => {
    assert.match(branchCashierInstallmentsTruncatedCellClass, /\btruncate\b|text-ellipsis/);
    assert.match(branchCashierInstallmentsTruncatedCellClass, /\bwhitespace-nowrap\b/);
    assert.match(branchCashierInstallmentsTruncatedCellClass, /\boverflow-hidden\b/);
    assert.match(branchCashierInstallmentsTruncatedCellClass, /\bmax-w-0\b/);
  });

  it('shows tooltip only for real values', () => {
    assert.equal(branchCashierInstallmentsTruncatedTooltip('INV-000123'), 'INV-000123');
    assert.equal(
      branchCashierInstallmentsTruncatedTooltip(BRANCH_CASHIER_INSTALLMENTS_STANDARD_RECEIPT),
      BRANCH_CASHIER_INSTALLMENTS_STANDARD_RECEIPT,
    );
    assert.equal(branchCashierInstallmentsTruncatedTooltip('—'), undefined);
    assert.equal(branchCashierInstallmentsTruncatedTooltip(''), undefined);
    assert.equal(branchCashierInstallmentsTruncatedTooltip(null), undefined);
  });

  it('exposes focusable tooltip props for truncated cells', () => {
    const props = branchCashierInstallmentsTruncatedCellProps('EM-20260803-00003');
    assert.equal(props.title, 'EM-20260803-00003');
    assert.equal(props.tabIndex, 0);
    assert.match(props.className, /\bwhitespace-nowrap\b/);
  });

  it('does not expose tooltip props for empty placeholder values', () => {
    const props = branchCashierInstallmentsTruncatedCellProps('—');
    assert.equal(props.title, undefined);
    assert.equal(props.tabIndex, undefined);
  });
});

describe('branch cashier installments page layout', () => {
  const pageSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/branch-cashier/installments/page.tsx'),
    'utf8',
  );

  it('renders standard invoice and receipt values in nowrap truncated cells', () => {
    assert.match(pageSource, /invoice\.invoiceNumber/);
    assert.match(pageSource, /resolveReceiptNumber\(invoice\)/);
    assert.match(pageSource, /branchCashierInstallmentsTruncatedCellClass/);
    assert.match(pageSource, /branchCashierInstallmentsColumnWidthClass\('invoiceNo'\)/);
    assert.match(pageSource, /branchCashierInstallmentsColumnWidthClass\('receipt'\)/);
  });

  it('keeps standard sample values within configured column widths', () => {
    assert.equal(BRANCH_CASHIER_INSTALLMENTS_STANDARD_INVOICE_NO.length <= 12, true);
    assert.equal(BRANCH_CASHIER_INSTALLMENTS_STANDARD_RECEIPT.length <= 18, true);
  });

  it('does not reintroduce horizontal scrolling wrapper', () => {
    assert.doesNotMatch(pageSource, /overflow-x-auto/);
  });
});
