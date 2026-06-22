import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, SaleStatus } from '@prisma/client';
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
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.branch.findMany({
      where: { id: user.branchId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    this.ensureBranchAccess(user, id);
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  update(id: string, dto: UpdateBranchDto) {
    return this.prisma.branch.update({ where: { id }, data: dto });
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
