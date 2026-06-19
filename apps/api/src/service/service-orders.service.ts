import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { BranchAccessService } from '../common/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateServiceOrderDto,
  ServiceTaskDto,
  UpdateServiceOrderDto,
  WarrantyDto,
} from './dto';

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  async create(user: AuthUser, dto: CreateServiceOrderDto) {
    const branchId = dto.customerId
      ? await this.branchIdFromCustomer(user, dto.customerId)
      : this.branchAccess.resolveBranchId(user, dto.branchId);

    return this.prisma.serviceOrder.create({
      data: {
        branchId,
        customerId: dto.customerId,
        assignedUserId: dto.assignedUserId,
        number: this.number(),
        vehicleInfo: dto.vehicleInfo,
        problem: dto.problem,
        diagnostic: dto.diagnostic,
        estimatedCost: dto.estimatedCost ?? 0,
        tasks: {
          create:
            dto.tasks?.map((task) => ({
              branchId,
              title: task.title,
              description: task.description,
              laborCost: task.laborCost ?? 0,
              partsCost: task.partsCost ?? 0,
              status: task.status ?? 'NEW',
            })) ?? [],
        },
      },
      include: { customer: true, tasks: true, warranties: true },
    });
  }

  list(user: AuthUser) {
    return this.prisma.serviceOrder.findMany({
      where: this.branchAccess.scope(user),
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, ...this.branchAccess.scope(user) },
      include: { customer: true, tasks: true, warranties: true },
    });
    if (!order) {
      throw new NotFoundException('Service order not found');
    }
    return order;
  }

  async update(user: AuthUser, id: string, dto: UpdateServiceOrderDto) {
    await this.findOne(user, id);
    return this.prisma.serviceOrder.update({
      where: { id },
      data: dto,
      include: { customer: true, tasks: true, warranties: true },
    });
  }

  async addTask(user: AuthUser, id: string, dto: ServiceTaskDto) {
    const order = await this.findOne(user, id);
    return this.prisma.serviceTask.create({
      data: {
        serviceOrderId: id,
        branchId: order.branchId,
        title: dto.title,
        description: dto.description,
        laborCost: dto.laborCost ?? 0,
        partsCost: dto.partsCost ?? 0,
        status: dto.status ?? 'NEW',
      },
    });
  }

  async addWarranty(user: AuthUser, id: string, dto: WarrantyDto) {
    const order = await this.findOne(user, id);
    return this.prisma.warranty.create({
      data: {
        serviceOrderId: id,
        branchId: order.branchId,
        title: dto.title,
        expiresAt: new Date(dto.expiresAt),
        notes: dto.notes,
      },
    });
  }

  private async branchIdFromCustomer(user: AuthUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...this.branchAccess.scope(user) },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer.branchId;
  }

  private number() {
    return `SO-${Date.now().toString(36).toUpperCase()}`;
  }
}
