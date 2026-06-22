import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchStatus, Role, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: {
        name: dto.name,
        code: dto.code,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
        ownerName: dto.ownerName,
        status: dto.status,
        openedAt: dto.openedAt,
      },
    });
  }

  findAll(user: AuthUser) {
    if (user.role === Role.OWNER) {
      return this.prisma.branch.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.branch.findMany({
      where: { id: user.branchId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    this.ensureBranchAccess(user, id);
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    if (dto.code && dto.code !== branch.code) {
      const duplicate = await this.prisma.branch.findUnique({
        where: { code: dto.code },
      });
      if (duplicate) throw new ConflictException('Branch code already exists');
    }

    return this.prisma.branch.update({ where: { id }, data: dto });
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

  private ensureBranchAccess(user: AuthUser, branchId: string) {
    if (user.role !== Role.OWNER && user.branchId !== branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }
  }
}
