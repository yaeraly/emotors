import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, WarehouseType } from '@prisma/client';
import { ensureHqCatalogBranch } from '../product-catalog/hq-product-catalog.util';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';

type PrismaTx = Prisma.TransactionClient;

export type MasterProductSnapshot = {
  id: string;
  branchId: string;
  warehouseId: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  weightKg: Prisma.Decimal;
  categoryId: string;
  category: string;
  minStockLevel: number;
  isActive: boolean;
  finalCostKgs: Prisma.Decimal;
  purchaseCostKgs: Prisma.Decimal;
  transportCostKgs: Prisma.Decimal;
  sellingPriceKgs: Prisma.Decimal;
  wholesalePriceKgs: Prisma.Decimal;
  hqBranchWholesalePriceKgs: Prisma.Decimal;
  defaultSupplierId: string | null;
  defaultFactoryId: string | null;
};

const masterProductSelect = {
  id: true,
  branchId: true,
  warehouseId: true,
  sku: true,
  barcode: true,
  name: true,
  unit: true,
  weightKg: true,
  categoryId: true,
  category: true,
  minStockLevel: true,
  isActive: true,
  finalCostKgs: true,
  purchaseCostKgs: true,
  transportCostKgs: true,
  sellingPriceKgs: true,
  wholesalePriceKgs: true,
  hqBranchWholesalePriceKgs: true,
  defaultSupplierId: true,
  defaultFactoryId: true,
} satisfies Prisma.ProductSelect;

export async function resolveMasterProductForReceivingInTx(
  tx: PrismaTx,
  params: {
    productId?: string | null;
    sku?: string | null;
    productName?: string | null;
  },
): Promise<MasterProductSnapshot> {
  const normalizedSku = params.sku?.trim();

  if (params.productId?.trim()) {
    const byId = await tx.product.findFirst({
      where: { id: params.productId.trim(), deletedAt: null },
      select: masterProductSelect,
    });
    if (byId) {
      return byId;
    }
  }

  if (!normalizedSku) {
    throw new BadRequestException('Product reference is missing from shipment item');
  }

  const hqBranch = await ensureHqCatalogBranch(tx);
  const hqCatalogProduct = await tx.product.findFirst({
    where: {
      branchId: hqBranch.id,
      sku: normalizedSku,
      deletedAt: null,
    },
    select: masterProductSelect,
  });
  if (hqCatalogProduct) {
    return hqCatalogProduct;
  }

  const activeMatches = await tx.product.findMany({
    where: {
      sku: normalizedSku,
      deletedAt: null,
      isActive: true,
    },
    select: masterProductSelect,
    take: 2,
  });
  if (activeMatches.length === 1) {
    return activeMatches[0];
  }
  if (activeMatches.length > 1) {
    throw new BadRequestException(
      `Ambiguous product reference for SKU ${normalizedSku}. Multiple active products found.`,
    );
  }

  if (params.productId?.trim()) {
    throw new NotFoundException(
      `Referenced product was not found. Product ID: ${params.productId.trim()}`,
    );
  }

  throw new NotFoundException(
    `Referenced product was not found for SKU ${normalizedSku}`,
  );
}

export async function resolveHqCatalogProductBySkuInTx(
  tx: PrismaTx,
  sku: string,
): Promise<MasterProductSnapshot | null> {
  const normalizedSku = sku.trim();
  if (!normalizedSku) return null;

  const hqBranch = await ensureHqCatalogBranch(tx);
  return tx.product.findFirst({
    where: {
      branchId: hqBranch.id,
      sku: normalizedSku,
      deletedAt: null,
    },
    select: masterProductSelect,
  });
}

export async function ensureBranchProductForReceivingInTx(
  tx: PrismaTx,
  params: {
    branchId: string;
    warehouseId: string;
    productId?: string | null;
    sku?: string | null;
    productName?: string | null;
    unitCostKgs?: number;
  },
): Promise<{ productId: string; branchId: string; masterProductId: string; created: boolean }> {
  const warehouse = await tx.warehouse.findFirst({
    where: {
      id: params.warehouseId,
      deletedAt: null,
      branchId: params.branchId,
      warehouseType: WarehouseType.BRANCH,
      isActive: true,
    },
    select: { id: true, branchId: true },
  });
  if (!warehouse) {
    throw new BadRequestException('Branch warehouse is not configured');
  }

  const masterProduct = await resolveMasterProductForReceivingInTx(tx, {
    productId: params.productId,
    sku: params.sku,
    productName: params.productName,
  });

  const sku = (params.sku?.trim() || masterProduct.sku).trim();
  if (!sku) {
    throw new BadRequestException('Product reference is missing from shipment item');
  }

  const existingBranchProduct = await tx.product.findFirst({
    where: {
      branchId: params.branchId,
      sku,
      deletedAt: null,
    },
    select: { id: true, warehouseId: true },
  });
  if (existingBranchProduct) {
    return {
      productId: existingBranchProduct.id,
      branchId: params.branchId,
      masterProductId: masterProduct.id,
      created: false,
    };
  }

  const hqBranch = await ensureHqCatalogBranch(tx);
  const catalogSource =
    masterProduct.branchId === hqBranch.id
      ? masterProduct
      : (await resolveHqCatalogProductBySkuInTx(tx, sku)) ?? masterProduct;

  const unitCostKgs = params.unitCostKgs ?? Number(catalogSource.finalCostKgs ?? 0);
  const created = await tx.product.create({
    data: {
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      categoryId: catalogSource.categoryId,
      category: catalogSource.category,
      name: params.productName?.trim() || catalogSource.name,
      sku,
      barcode: catalogSource.barcode,
      unit: catalogSource.unit,
      weightKg: catalogSource.weightKg,
      defaultSupplierId: catalogSource.defaultSupplierId,
      defaultFactoryId: catalogSource.defaultFactoryId,
      purchaseCostKgs: catalogSource.purchaseCostKgs,
      transportCostKgs: catalogSource.transportCostKgs,
      finalCostKgs: unitCostKgs,
      costPriceKgs: unitCostKgs,
      sellingPriceKgs: catalogSource.sellingPriceKgs,
      wholesalePriceKgs: catalogSource.wholesalePriceKgs,
      hqBranchWholesalePriceKgs: catalogSource.hqBranchWholesalePriceKgs,
      minStockLevel: catalogSource.minStockLevel ?? 0,
      isActive: catalogSource.isActive,
    },
    select: { id: true },
  });

  return {
    productId: created.id,
    branchId: params.branchId,
    masterProductId: catalogSource.id,
    created: true,
  };
}

export function isHqCatalogBranchCode(branchCode: string | null | undefined) {
  return branchCode === HQ_CATALOG_BRANCH_CODE;
}
