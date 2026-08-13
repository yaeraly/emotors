import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  buildDistributionOrderItemPricePatches,
  sumBranchPurchaseApprovedInvoiceTotalKgs,
  type BranchPurchaseInvoiceLineSource,
} from './branch-purchase-invoice-lines.util';

type PrismaTx = {
  branchPurchaseRequest: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  branchDistributionOrder: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  branchDistributionOrderItem: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    update: (args: unknown) => Promise<unknown>;
  };
  branchInvoice: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<unknown>;
  };
};

export async function repairBranchPurchaseLinkedInvoicePricesInTx(
  tx: PrismaTx,
  lookup: { requestId?: string; requestNumber?: string; invoiceId?: string },
): Promise<{
  requestId: string;
  requestNumber: string;
  invoiceId: string | null;
  distributionOrderId: string | null;
  previousInvoiceTotalKgs: number | null;
  repairedInvoiceTotalKgs: number | null;
  lineRepairs: Array<{
    productId: string;
    previousUnitPrice: number;
    repairedUnitPrice: number;
    previousLineTotal: number;
    repairedLineTotal: number;
  }>;
}> {
  const request = await tx.branchPurchaseRequest.findFirst({
    where: {
      deletedAt: null,
      ...(lookup.requestId
        ? { id: lookup.requestId }
        : lookup.requestNumber
          ? { requestNumber: lookup.requestNumber }
          : {}),
    },
    include: {
      items: { orderBy: { position: 'asc' } },
      branch: { select: { branchType: true } },
    },
  });

  if (!request) {
    throw new Error('Branch purchase request not found');
  }

  const branchType = (request.branch as { branchType?: string | null } | null)?.branchType ?? null;
  const bprItems = (request.items as Array<Record<string, unknown>>).map((row) => ({
    ...(row as BranchPurchaseInvoiceLineSource),
    branchType,
  }));
  const distributionOrderId = (request.convertedOrderId as string | null) ?? null;

  let invoice: Record<string, unknown> | null = null;
  if (lookup.invoiceId) {
    invoice = await tx.branchInvoice.findFirst({
      where: { id: lookup.invoiceId, deletedAt: null },
    });
  } else if (distributionOrderId) {
    invoice = await tx.branchInvoice.findFirst({
      where: {
        distributionOrderId,
        deletedAt: null,
        invoiceCategory: 'PRODUCT_ORDER',
      },
    });
  }

  const lineRepairs: Array<{
    productId: string;
    previousUnitPrice: number;
    repairedUnitPrice: number;
    previousLineTotal: number;
    repairedLineTotal: number;
  }> = [];

  if (distributionOrderId) {
    const orderItems = (await tx.branchDistributionOrderItem.findMany({
      where: { orderId: distributionOrderId },
    })) as Array<{ id: string; productId: string; unitPrice?: unknown; totalPrice?: unknown; unitCost?: unknown; totalCost?: unknown }>;
    const patches = buildDistributionOrderItemPricePatches(bprItems, orderItems);
    const patchByProduct = new Map(patches.map((patch) => [patch.productId, patch]));

    for (const orderItem of orderItems) {
      const patch = patchByProduct.get(String(orderItem.productId));
      if (!patch) continue;

      const previousUnitPrice = roundDisplayMoney(Number(orderItem.unitPrice ?? 0));
      const previousLineTotal = roundDisplayMoney(Number(orderItem.totalPrice ?? 0));
      if (previousUnitPrice === patch.unitPrice && previousLineTotal === patch.totalPrice) {
        continue;
      }

      lineRepairs.push({
        productId: String(orderItem.productId),
        previousUnitPrice,
        repairedUnitPrice: patch.unitPrice,
        previousLineTotal,
        repairedLineTotal: patch.totalPrice,
      });

      await tx.branchDistributionOrderItem.update({
        where: { id: orderItem.id },
        data: {
          quantity: patch.quantity,
          unitPrice: patch.unitPrice,
          totalPrice: patch.totalPrice,
          profit: patch.profit,
        },
      });
    }

    const repairedOrderTotal = sumBranchPurchaseApprovedInvoiceTotalKgs(bprItems);
    await tx.branchDistributionOrder.update({
      where: { id: distributionOrderId },
      data: {
        totalAmount: repairedOrderTotal,
        totalProfit: roundDisplayMoney(
          repairedOrderTotal -
            orderItems.reduce((sum, row) => sum + Number(row.totalCost ?? 0), 0),
        ),
      },
    });
  }

  const repairedInvoiceTotal = sumBranchPurchaseApprovedInvoiceTotalKgs(bprItems);
  const previousInvoiceTotalKgs =
    invoice != null ? roundDisplayMoney(Number(invoice.totalAmount ?? 0)) : null;

  if (invoice && previousInvoiceTotalKgs !== repairedInvoiceTotal) {
    const paidAmount = roundDisplayMoney(Number(invoice.paidAmount ?? 0));
    await tx.branchInvoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: repairedInvoiceTotal,
        debtAmount: roundDisplayMoney(Math.max(repairedInvoiceTotal - paidAmount, 0)),
      },
    });
  }

  return {
    requestId: String(request.id),
    requestNumber: String(request.requestNumber),
    invoiceId: invoice ? String(invoice.id) : null,
    distributionOrderId,
    previousInvoiceTotalKgs,
    repairedInvoiceTotalKgs: invoice ? repairedInvoiceTotal : null,
    lineRepairs,
  };
}
