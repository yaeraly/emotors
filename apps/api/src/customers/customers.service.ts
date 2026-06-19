import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { BranchAccessService } from '../common/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerDto,
  CustomerEventDto,
  FollowUpDto,
  UpdateCustomerDto,
} from './dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  async create(user: AuthUser, dto: CreateCustomerDto) {
    const branchId = this.branchAccess.resolveBranchId(user, dto.branchId);
    const customer = await this.prisma.customer.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        whatsappPhone: dto.whatsappPhone,
        branchId,
        status: dto.status,
        notes: dto.notes,
      },
    });

    await this.prisma.customerEvent.create({
      data: {
        customerId: customer.id,
        branchId,
        type: 'NOTE',
        title: 'Customer created',
      },
    });

    return customer;
  }

  list(user: AuthUser, search?: string) {
    const where: Prisma.CustomerWhereInput = {
      ...this.branchAccess.scope(user),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { whatsappPhone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, ...this.branchAccess.scope(user) },
      include: {
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        followUps: { orderBy: { dueAt: 'asc' }, take: 20 },
        sales: { orderBy: { createdAt: 'desc' }, take: 20 },
        serviceOrders: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto) {
    await this.findOne(user, id);
    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  async addEvent(user: AuthUser, id: string, dto: CustomerEventDto) {
    const customer = await this.findOne(user, id);
    return this.prisma.customerEvent.create({
      data: {
        customerId: id,
        branchId: customer.branchId,
        type: dto.type ?? 'NOTE',
        title: dto.title,
        details: dto.details,
      },
    });
  }

  async addFollowUp(user: AuthUser, id: string, dto: FollowUpDto) {
    const customer = await this.findOne(user, id);
    return this.prisma.followUp.create({
      data: {
        customerId: id,
        branchId: customer.branchId,
        title: dto.title,
        dueAt: new Date(dto.dueAt),
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  async timeline(user: AuthUser, id: string) {
    await this.findOne(user, id);
    const [events, followUps, sales, serviceOrders] = await Promise.all([
      this.prisma.customerEvent.findMany({
        where: { customerId: id, ...this.branchAccess.scope(user) },
      }),
      this.prisma.followUp.findMany({
        where: { customerId: id, ...this.branchAccess.scope(user) },
      }),
      this.prisma.sale.findMany({
        where: { customerId: id, ...this.branchAccess.scope(user) },
      }),
      this.prisma.serviceOrder.findMany({
        where: { customerId: id, ...this.branchAccess.scope(user) },
      }),
    ]);

    return [
      ...events.map((event) => ({
        type: `EVENT_${event.type}`,
        at: event.createdAt,
        title: event.title,
        details: event.details,
      })),
      ...followUps.map((followUp) => ({
        type: 'FOLLOW_UP',
        at: followUp.dueAt,
        title: followUp.title,
        details: followUp.notes,
        status: followUp.status,
      })),
      ...sales.map((sale) => ({
        type: 'SALE',
        at: sale.createdAt,
        title: sale.number,
        total: sale.total,
        paymentStatus: sale.paymentStatus,
      })),
      ...serviceOrders.map((order) => ({
        type: 'SERVICE',
        at: order.createdAt,
        title: order.number,
        status: order.status,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }
}
