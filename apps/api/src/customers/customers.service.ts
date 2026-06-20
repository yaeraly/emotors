import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEventType,
  FollowUpStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AddCustomerEventDto } from './dto/add-customer-event.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: CustomerQueryDto) {
    const branchId = this.resolveBranchId(user, query.branchId);
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      branchId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { whatsappPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      include: {
        branch: true,
        _count: {
          select: {
            events: true,
            followUps: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(user: AuthUser, dto: CreateCustomerDto) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    await this.ensureBranchExists(branchId);

    return this.prisma.customer.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        whatsappPhone: dto.whatsappPhone,
        branchId,
        status: dto.status,
        notes: dto.notes,
        totalPurchaseAmount: dto.totalPurchaseAmount,
        totalProfitAmount: dto.totalProfitAmount,
        totalDebtAmount: dto.totalDebtAmount,
      },
      include: { branch: true },
    });
  }

  async findOne(user: AuthUser, id: string) {
    return this.getAccessibleCustomer(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto) {
    await this.getAccessibleCustomer(user, id);

    return this.prisma.customer.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        whatsappPhone: dto.whatsappPhone,
        status: dto.status,
        notes: dto.notes,
        totalPurchaseAmount: dto.totalPurchaseAmount,
        totalProfitAmount: dto.totalProfitAmount,
        totalDebtAmount: dto.totalDebtAmount,
      },
      include: { branch: true },
    });
  }

  async softDelete(user: AuthUser, id: string) {
    await this.getAccessibleCustomer(user, id);

    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, deletedAt: true },
    });
  }

  async addEvent(user: AuthUser, customerId: string, dto: AddCustomerEventDto) {
    const customer = await this.getAccessibleCustomer(user, customerId);

    return this.prisma.customerEvent.create({
      data: {
        customerId: customer.id,
        branchId: customer.branchId,
        type: dto.type,
        message: dto.message,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async addWhatsAppEvent(user: AuthUser, customerId: string, message: string) {
    return this.addEvent(user, customerId, {
      type: CustomerEventType.WHATSAPP,
      message,
    });
  }

  async addFollowUp(
    user: AuthUser,
    customerId: string,
    dto: CreateFollowUpDto,
  ) {
    const customer = await this.getAccessibleCustomer(user, customerId);

    return this.prisma.followUp.create({
      data: {
        customerId: customer.id,
        branchId: customer.branchId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async markFollowUpDone(
    user: AuthUser,
    customerId: string,
    followUpId: string,
  ) {
    const customer = await this.getAccessibleCustomer(user, customerId);
    const followUp = await this.prisma.followUp.findFirst({
      where: {
        id: followUpId,
        customerId: customer.id,
        branchId: customer.branchId,
      },
    });

    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }

    return this.prisma.followUp.update({
      where: { id: followUpId },
      data: { status: FollowUpStatus.DONE },
    });
  }

  async timeline(user: AuthUser, customerId: string) {
    const customer = await this.getAccessibleCustomer(user, customerId);
    const [events, followUps] = await Promise.all([
      this.prisma.customerEvent.findMany({
        where: {
          customerId: customer.id,
          branchId: customer.branchId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.followUp.findMany({
        where: {
          customerId: customer.id,
          branchId: customer.branchId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const timeline = [
      ...events.map((event) => ({
        kind: 'event' as const,
        at: event.createdAt,
        item: event,
      })),
      ...followUps.map((followUp) => ({
        kind: 'followUp' as const,
        at: followUp.createdAt,
        item: followUp,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      customer,
      events,
      whatsappEvents: events.filter(
        (event) => event.type === CustomerEventType.WHATSAPP,
      ),
      followUps,
      timeline,
    };
  }

  private resolveBranchId(user: AuthUser, requestedBranchId?: string) {
    if (user.role === Role.OWNER) {
      return requestedBranchId ?? user.branchId;
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return user.branchId;
  }

  private async ensureBranchExists(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }

  private async getAccessibleCustomer(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }),
      },
      include: {
        branch: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }
}
