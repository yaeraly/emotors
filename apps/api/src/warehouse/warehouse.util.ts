import { BadRequestException } from '@nestjs/common';
import { WarehouseType } from '@prisma/client';

export function isHqWarehouse(warehouse: {
  warehouseType: WarehouseType;
  branchId: string | null;
}) {
  return warehouse.warehouseType === WarehouseType.HQ && warehouse.branchId === null;
}

export function isBranchWarehouse(warehouse: {
  warehouseType: WarehouseType;
  branchId: string | null;
}) {
  return warehouse.warehouseType === WarehouseType.BRANCH && warehouse.branchId !== null;
}

export function inventoryBranchIdForWarehouse(
  warehouse: { warehouseType: WarehouseType; branchId: string | null },
  productBranchId: string,
) {
  if (warehouse.warehouseType === WarehouseType.HQ) {
    return productBranchId;
  }
  if (!warehouse.branchId) {
    throw new BadRequestException('Branch warehouse must be linked to a branch');
  }
  return warehouse.branchId;
}

export function assertProductWarehouseBranchMatch(
  warehouse: { warehouseType: WarehouseType; branchId: string | null },
  productBranchId: string,
) {
  if (warehouse.warehouseType === WarehouseType.HQ) {
    return;
  }
  if (productBranchId !== warehouse.branchId) {
    throw new BadRequestException('Product and warehouse branch mismatch');
  }
}

export const hqWarehouseWhere = {
  warehouseType: WarehouseType.HQ,
  branchId: null,
  deletedAt: null,
} as const;

export const activeHqWarehouseWhere = {
  ...hqWarehouseWhere,
  isActive: true,
} as const;

export const branchWarehouseWhere = {
  warehouseType: WarehouseType.BRANCH,
  branchId: { not: null },
  deletedAt: null,
} as const;
