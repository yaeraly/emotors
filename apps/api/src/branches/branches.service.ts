import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BranchStatus, BranchType, Prisma, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccountantRestrictedRoute, canAssignBranchHqWarehouse, hasAnyHqRole, resolveUserRoles } from '../rbac/rbac';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AssignBranchHqWarehouseDto } from './dto/assign-branch-hq-warehouse.dto';

const branchInclude = {
  priceProfile: {
    select: { id: true, name: true, code: true, profileType: true },
  },
  assignedHqWarehouse: {
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      isActive: true,
      hqManagerAssignments: {
        where: { status: 'ACTIVE' as const },
        orderBy: { assignedAt: 'asc' as const },
        take: 1,
        select: {
          user: { select: { id: true, fullName: true } },
        },
      },
    },
  },
};

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateBranchDto) {
    if (dto.assignedHqWarehouseId && !canAssignBranchHqWarehouse(user)) {
      throw new ForbiddenException('Only CEO can assign HQ warehouse to branch');
    }

    const assignedHqWarehouseId = canAssignBranchHqWarehouse(user)
      ? (dto.assignedHqWarehouseId ?? null)
      : null;
    if (assignedHqWarehouseId) {
      await this.assertActiveHqWarehouse(assignedHqWarehouseId);
    }

    const branch = await this.prisma.branch.create({
      data: {
        name: dto.name,
        code: dto.code,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
        ownerName: dto.ownerName,
        status: dto.status,
        branchType: dto.branchType ?? BranchType.FRANCHISE,
        openedAt: dto.openedAt,
        assignedHqWarehouseId,
      },
      include: branchInclude,
    });

    if (assignedHqWarehouseId) {
      await this.auditHqWarehouseAssignment(user, branch.id, null, assignedHqWarehouseId);
    }

    return branch;
  }

  findAll(user: AuthUser, query: BranchQueryDto = {}) {
    assertBranchAccountantRestrictedRoute(user);
    const where: Prisma.BranchWhereInput = {
      deletedAt: null,
      ...(this.canViewAllBranches(user) ? {} : { id: user.branchId }),
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.city?.trim()) {
      where.city = { equals: query.city.trim(), mode: 'insensitive' };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.branchType) {
      where.branchType = query.branchType;
    }

    if (query.ownerName?.trim()) {
      where.ownerName = {
        contains: query.ownerName.trim(),
        mode: 'insensitive',
      };
    }

    return this.prisma.branch.findMany({
      where,
      include: branchInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    assertBranchAccountantRestrictedRoute(user);
    this.ensureBranchAccess(user, id);
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: branchInclude,
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(user: AuthUser, id: string, dto: UpdateBranchDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    if (dto.assignedHqWarehouseId !== undefined && !canAssignBranchHqWarehouse(user)) {
      throw new ForbiddenException('Only CEO can assign HQ warehouse to branch');
    }

    if (dto.code && dto.code !== branch.code) {
      const duplicate = await this.prisma.branch.findUnique({
        where: { code: dto.code },
      });
      if (duplicate) throw new ConflictException('Branch code already exists');
    }

    const nextWarehouseId =
      dto.assignedHqWarehouseId !== undefined ? dto.assignedHqWarehouseId : branch.assignedHqWarehouseId;
    if (dto.assignedHqWarehouseId !== undefined && nextWarehouseId) {
      await this.assertActiveHqWarehouse(nextWarehouseId);
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
        ownerName: dto.ownerName,
        status: dto.status,
        branchType: dto.branchType,
        openedAt: dto.openedAt,
        ...(dto.assignedHqWarehouseId !== undefined
          ? { assignedHqWarehouseId: dto.assignedHqWarehouseId }
          : {}),
      },
      include: branchInclude,
    });

    if (dto.assignedHqWarehouseId !== undefined && dto.assignedHqWarehouseId !== branch.assignedHqWarehouseId) {
      await this.auditHqWarehouseAssignment(user, id, branch.assignedHqWarehouseId, dto.assignedHqWarehouseId);
    }

    return updated;
  }

  async delete(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const [
      users,
      customers,
      sales,
      products,
      stockMovements,
      warehouses,
    ] = await Promise.all([
      this.prisma.user.count({ where: { branchId: id } }),
      this.prisma.customer.count({ where: { branchId: id } }),
      this.prisma.sale.count({ where: { branchId: id } }),
      this.prisma.product.count({ where: { branchId: id } }),
      this.prisma.stockMovement.count({ where: { branchId: id } }),
      this.prisma.warehouse.count({ where: { branchId: id } }),
    ]);
    const hasRelatedData =
      users + customers + sales + products + stockMovements + warehouses > 0;

    await this.prisma.branch.update({
      where: { id },
      data: {
        status: BranchStatus.INACTIVE,
        deletedAt: new Date(),
      },
    });

    return {
      success: true,
      message: hasRelatedData
        ? 'Branch deactivated because it has related data.'
        : 'Branch deactivated successfully',
      deactivated: true,
    };
  }

  async assignHqWarehouse(user: AuthUser, id: string, dto: AssignBranchHqWarehouseDto) {
    if (!canAssignBranchHqWarehouse(user)) {
      throw new ForbiddenException('Only CEO can assign HQ warehouse to branch');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const nextWarehouseId = dto.assignedHqWarehouseId ?? null;
    if (nextWarehouseId) {
      await this.assertActiveHqWarehouse(nextWarehouseId);
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: { assignedHqWarehouseId: nextWarehouseId },
      include: branchInclude,
    });

    if (nextWarehouseId !== branch.assignedHqWarehouseId) {
      await this.auditHqWarehouseAssignment(user, id, branch.assignedHqWarehouseId, nextWarehouseId);
    }

    return updated;
  }

  async dashboard(user: AuthUser, id: string) {
    this.ensureBranchAccess(user, id);
    const branch = await this.findOne(user, id);
    const [customerCount, sales, inventoryBalances, lowStockCount] = await Promise.all([
      this.prisma.customer.count({ where: { branchId: id, deletedAt: null } }),
      this.prisma.sale.findMany({
        where: { branchId: id, deletedAt: null, status: SaleStatus.FINALIZED },
        select: { totalAmount: true, profitAmount: true, debtAmount: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: { branchId: id },
        select: { quantity: true, totalValueKgs: true },
      }),
      this.prisma.inventoryBalance.count({
        where: { branchId: id, product: { minStockLevel: { gte: 0 } } },
      }),
    ]);

    return {
      branch,
      customerCount,
      totalSales: sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0),
      totalProfit: sales.reduce((sum, sale) => sum + Number(sale.profitAmount), 0),
      debtAmount: sales.reduce((sum, sale) => sum + Number(sale.debtAmount), 0),
      inventoryQuantity: inventoryBalances.reduce((sum, item) => sum + item.quantity, 0),
      inventoryValue: inventoryBalances.reduce((sum, item) => sum + Number(item.totalValueKgs), 0),
      lowStockCount,
    };
  }

  private async assertActiveHqWarehouse(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, ...activeHqWarehouseWhere },
    });
    if (!warehouse || !isHqWarehouse(warehouse)) {
      throw new BadRequestException('Assigned HQ warehouse must be an active HQ warehouse');
    }
    return warehouse;
  }

  private async auditHqWarehouseAssignment(
    user: AuthUser,
    branchId: string,
    oldWarehouseId: string | null | undefined,
    newWarehouseId: string | null | undefined,
  ) {
    const action = !oldWarehouseId && newWarehouseId
      ? 'BRANCH_HQ_WAREHOUSE_ASSIGNED'
      : oldWarehouseId && !newWarehouseId
        ? 'BRANCH_HQ_WAREHOUSE_REMOVED'
        : oldWarehouseId && newWarehouseId && oldWarehouseId !== newWarehouseId
          ? 'BRANCH_HQ_WAREHOUSE_CHANGED'
          : null;

    if (!action) return;

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Branch',
        entityId: branchId,
        metadata: {
          userId: user.id,
          role: user.role,
          branchId,
          hqWarehouseId: newWarehouseId,
          oldValue: oldWarehouseId ?? null,
          newValue: newWarehouseId ?? null,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  private canViewAllBranches(user: AuthUser) {
    return hasAnyHqRole(resolveUserRoles(user));
  }

  private ensureBranchAccess(user: AuthUser, branchId: string) {
    if (!this.canViewAllBranches(user) && user.branchId !== branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }
  }
}
