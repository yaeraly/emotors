import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { BranchStatus, BranchType, Prisma, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertBranchAccountantRestrictedRoute,
  canAssignBranchHqWarehouse,
  canChangeBranchType,
  hasAnyHqRole,
  resolveUserRoles,
} from '../rbac/rbac';
import {
  assessBranchDeleteBlocking,
  assertCanHqCeoManageLifecycle,
  archiveBranch,
  branchHasBusinessHistory,
  assessBranchWarehouseDeleteBlocking,
  hardDeleteBranchWarehouse,
} from '../lifecycle/hq-ceo-lifecycle.util';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AssignBranchHqWarehouseDto } from './dto/assign-branch-hq-warehouse.dto';
import {
  isProfileCompatibleWithBranch,
  resolveDefaultPriceProfileId,
} from '../pricing/pricing-profile-defaults.util';
import { BRANCH_CODE_GENERATION_FAILED, generateBranchCode } from './branch-code.util';

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

const BRANCH_TYPE_CHANGE_REASON_CODES = new Set([
  'BUSINESS_MODEL_CHANGED',
  'FRANCHISE_CONVERTED',
  'DEALER_CONVERTED',
  'DISTRIBUTOR_CONVERTED',
  'HQ_RESTRUCTURE',
  'MANAGEMENT_DECISION',
  'OTHER',
]);

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

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

    const branchType = dto.branchType ?? BranchType.FRANCHISE;
    const priceProfileId = await resolveDefaultPriceProfileId(this.prisma, branchType);
    const manualCode = dto.code?.trim().toUpperCase() || null;

    let branch;
    try {
      branch = await this.prisma.$transaction(async (tx) => {
        const code = manualCode ?? (await generateBranchCode(tx, branchType));
        const created = await tx.branch.create({
          data: {
            name: dto.name,
            code,
            city: dto.city,
            address: dto.address,
            phone: dto.phone,
            ownerName: dto.ownerName,
            status: dto.status,
            branchType,
            openedAt: dto.openedAt,
            assignedHqWarehouseId,
            priceProfileId,
          },
          include: branchInclude,
        });

        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'BRANCH_CODE_GENERATED',
            entity: 'Branch',
            entityId: created.id,
            metadata: {
              branchId: created.id,
              branchCode: created.code,
              branchType,
              generatedById: user.id,
              generationMethod: manualCode ? 'manual' : 'auto_sequence',
              timestamp: new Date().toISOString(),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'BRANCH_CREATED',
            entity: 'Branch',
            entityId: created.id,
            metadata: {
              branchId: created.id,
              branchCode: created.code,
              branchType,
              name: created.name,
              pricingProfileId: created.priceProfileId,
              status: created.status,
              createdById: user.id,
              timestamp: new Date().toISOString(),
            },
          },
        });

        return created;
      });
    } catch (error) {
      if (error instanceof Error && error.message === BRANCH_CODE_GENERATION_FAILED) {
        throw new InternalServerErrorException(BRANCH_CODE_GENERATION_FAILED);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new InternalServerErrorException(BRANCH_CODE_GENERATION_FAILED);
      }
      throw error;
    }

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
      include: { priceProfile: { select: { id: true, name: true, code: true, profileType: true } } },
    });
    if (!branch) throw new NotFoundException('Филиал не найден');

    const requestedBranchType = dto.branchType;
    const branchTypeChanging =
      requestedBranchType !== undefined && requestedBranchType !== branch.branchType;

    this.logger.log({
      message: 'Branch update requested',
      branchId: id,
      oldBranchType: branch.branchType,
      requestedBranchType: requestedBranchType ?? null,
      oldPricingProfileId: branch.priceProfileId,
      requestedPricingProfileId: dto.priceProfileId ?? null,
      authenticatedUserId: user.id,
      authenticatedRole: user.role,
      validationStage: 'start',
    });

    if (branchTypeChanging && !canChangeBranchType(user)) {
      throw new ForbiddenException('У вас нет прав для изменения типа филиала');
    }

    if (dto.assignedHqWarehouseId !== undefined && !canAssignBranchHqWarehouse(user)) {
      throw new ForbiddenException('Only CEO can assign HQ warehouse to branch');
    }

    if (requestedBranchType !== undefined && !Object.values(BranchType).includes(requestedBranchType)) {
      throw new BadRequestException('Указан некорректный тип филиала');
    }

    // Branch code must remain stable unless CEO explicitly changes it to another unique value.
    // Never regenerate code from branchType.
    if (dto.code !== undefined) {
      const nextCode = dto.code.trim().toUpperCase();
      if (nextCode !== branch.code) {
        const duplicate = await this.prisma.branch.findUnique({ where: { code: nextCode } });
        if (duplicate) throw new ConflictException('Branch code already exists');
      }
    }

    const nextWarehouseId =
      dto.assignedHqWarehouseId !== undefined
        ? dto.assignedHqWarehouseId || null
        : branch.assignedHqWarehouseId;
    if (dto.assignedHqWarehouseId !== undefined && nextWarehouseId) {
      await this.assertActiveHqWarehouse(nextWarehouseId);
    }

    const nextBranchType = requestedBranchType ?? branch.branchType;
    let nextPriceProfileId =
      dto.priceProfileId !== undefined ? dto.priceProfileId || null : branch.priceProfileId;

    if (branchTypeChanging) {
      const reasonCode = dto.branchTypeChangeReasonCode?.trim() || 'MANAGEMENT_DECISION';
      if (!BRANCH_TYPE_CHANGE_REASON_CODES.has(reasonCode)) {
        throw new BadRequestException('Указан некорректный тип филиала');
      }
      if (reasonCode === 'OTHER' && !dto.branchTypeChangeReasonComment?.trim()) {
        throw new BadRequestException('Не удалось изменить тип филиала');
      }

      if (nextPriceProfileId) {
        const profile = await this.prisma.branchPriceProfile.findFirst({
          where: { id: nextPriceProfileId },
          select: { id: true, profileType: true, status: true },
        });
        if (!profile || profile.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Текущий ценовой профиль несовместим с новым типом филиала. Выберите подходящий профиль',
          );
        }
        if (!isProfileCompatibleWithBranch(nextBranchType, profile.profileType)) {
          throw new BadRequestException(
            'Текущий ценовой профиль несовместим с новым типом филиала. Выберите подходящий профиль',
          );
        }
      } else {
        // Keep existing if compatible; otherwise require explicit compatible profile.
        if (branch.priceProfile) {
          if (isProfileCompatibleWithBranch(nextBranchType, branch.priceProfile.profileType)) {
            nextPriceProfileId = branch.priceProfileId;
          } else {
            const defaultProfileId = await resolveDefaultPriceProfileId(this.prisma, nextBranchType);
            if (!defaultProfileId) {
              throw new BadRequestException(
                'Текущий ценовой профиль несовместим с новым типом филиала. Выберите подходящий профиль',
              );
            }
            // Prefer explicit selection; if none provided, auto-assign default compatible profile.
            if (dto.priceProfileId === undefined) {
              nextPriceProfileId = defaultProfileId;
            } else {
              throw new BadRequestException(
                'Текущий ценовой профиль несовместим с новым типом филиала. Выберите подходящий профиль',
              );
            }
          }
        } else {
          nextPriceProfileId = await resolveDefaultPriceProfileId(this.prisma, nextBranchType);
        }
      }
    } else if (dto.priceProfileId !== undefined && nextPriceProfileId) {
      const profile = await this.prisma.branchPriceProfile.findFirst({
        where: { id: nextPriceProfileId },
        select: { id: true, profileType: true, status: true },
      });
      if (!profile || profile.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Текущий ценовой профиль несовместим с новым типом филиала. Выберите подходящий профиль',
        );
      }
      if (!isProfileCompatibleWithBranch(nextBranchType, profile.profileType)) {
        throw new BadRequestException(
          'Текущий ценовой профиль несовместим с новым типом филиала. Выберите подходящий профиль',
        );
      }
    }

    const data: Prisma.BranchUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.ownerName !== undefined) data.ownerName = dto.ownerName;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.openedAt !== undefined) data.openedAt = dto.openedAt;
    if (branchTypeChanging) data.branchType = nextBranchType;
    if (dto.assignedHqWarehouseId !== undefined) {
      data.assignedHqWarehouse = nextWarehouseId
        ? { connect: { id: nextWarehouseId } }
        : { disconnect: true };
    }
    if (
      branchTypeChanging
      || (dto.priceProfileId !== undefined && nextPriceProfileId !== branch.priceProfileId)
    ) {
      data.priceProfile = nextPriceProfileId
        ? { connect: { id: nextPriceProfileId } }
        : { disconnect: true };
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.branch.update({
          where: { id },
          data,
          include: branchInclude,
        });

        if (branchTypeChanging) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              role: user.role,
              action: 'BRANCH_TYPE_CHANGED',
              entity: 'Branch',
              entityId: id,
              metadata: {
                userId: user.id,
                role: user.role,
                branchId: id,
                branchName: branch.name,
                oldBranchType: branch.branchType,
                newBranchType: nextBranchType,
                oldPricingProfileId: branch.priceProfileId,
                newPricingProfileId: nextPriceProfileId,
                reasonCode: dto.branchTypeChangeReasonCode?.trim() || 'MANAGEMENT_DECISION',
                reasonComment: dto.branchTypeChangeReasonComment?.trim() || null,
                timestamp: new Date().toISOString(),
              },
            },
          });
        }

        if (
          dto.assignedHqWarehouseId !== undefined
          && nextWarehouseId !== branch.assignedHqWarehouseId
        ) {
          await this.auditHqWarehouseAssignmentInTx(
            tx,
            user,
            id,
            branch.assignedHqWarehouseId,
            nextWarehouseId,
          );
        }

        return saved;
      });

      this.logger.log({
        message: 'Branch update succeeded',
        branchId: id,
        oldBranchType: branch.branchType,
        newBranchType: updated.branchType,
        oldPricingProfileId: branch.priceProfileId,
        newPricingProfileId: updated.priceProfileId,
        authenticatedUserId: user.id,
        validationStage: 'completed',
      });

      return {
        ...updated,
        oldBranchType: branch.branchType,
        newBranchType: updated.branchType,
        profileChanged: branch.priceProfileId !== updated.priceProfileId,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException
        || error instanceof ForbiddenException
        || error instanceof NotFoundException
        || error instanceof ConflictException
      ) {
        throw error;
      }

      const prismaCode =
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      this.logger.error({
        message: 'Branch update failed',
        branchId: id,
        oldBranchType: branch.branchType,
        requestedBranchType: requestedBranchType ?? null,
        oldPricingProfileId: branch.priceProfileId,
        requestedPricingProfileId: dto.priceProfileId ?? null,
        authenticatedUserId: user.id,
        authenticatedRole: user.role,
        validationStage: 'prisma_update',
        prismaErrorCode: prismaCode ?? null,
        exceptionMessage: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException('Не удалось изменить тип филиала');
        }
        if (error.code === 'P2002') {
          throw new ConflictException('Branch code already exists');
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('Филиал не найден');
        }
      }

      throw new BadRequestException('Не удалось изменить тип филиала');
    }
  }

  async delete(user: AuthUser, id: string, reason?: string) {
    assertCanHqCeoManageLifecycle(user);

    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const previousStatus = branch.status;
    const trimmedReason = reason?.trim() || null;

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_DELETE_REQUESTED',
        entity: 'Branch',
        entityId: id,
        metadata: {
          actorUserId: user.id,
          branchId: id,
          branchName: branch.name,
          branchCode: branch.code,
          oldStatus: previousStatus,
          reason: trimmedReason,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const { blocked, reasons } = await assessBranchDeleteBlocking(tx, id);
      if (blocked) {
        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'BRANCH_DELETE_BLOCKED',
            entity: 'Branch',
            entityId: id,
            metadata: {
              actorUserId: user.id,
              branchId: id,
              oldStatus: previousStatus,
              blockingRecords: reasons,
              timestamp: new Date().toISOString(),
            },
          },
        });
        throw new BadRequestException({
          message: 'Филиал не может быть удалён: есть активные операции или остатки.',
          blockingRecords: reasons,
        });
      }

      const hasHistory = await branchHasBusinessHistory(tx, id);

      if (!hasHistory) {
        const warehouses = await tx.warehouse.findMany({
          where: { branchId: id, deletedAt: null },
          select: { id: true },
        });
        for (const warehouse of warehouses) {
          const warehouseBlocking = await assessBranchWarehouseDeleteBlocking(tx, warehouse.id);
          if (warehouseBlocking.blocked) {
            throw new BadRequestException({
              message: 'Филиал не может быть удалён: склад филиала не пуст.',
              blockingRecords: warehouseBlocking.reasons,
            });
          }
          await hardDeleteBranchWarehouse(tx, warehouse.id);
        }

        await tx.branch.delete({ where: { id } });

        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'BRANCH_DELETED',
            entity: 'Branch',
            entityId: id,
            metadata: {
              actorUserId: user.id,
              branchId: id,
              branchName: branch.name,
              branchCode: branch.code,
              oldStatus: previousStatus,
              newStatus: null,
              deletionType: 'hard_delete',
              reason: trimmedReason,
              timestamp: new Date().toISOString(),
            },
          },
        });

        return {
          success: true,
          deletedBranchId: id,
          archived: false,
          message: 'Филиал успешно удалён',
        };
      }

      if (!trimmedReason) {
        throw new BadRequestException('Укажите причину архивации филиала с историей операций');
      }

      await archiveBranch(tx, id);

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_ARCHIVED',
          entity: 'Branch',
          entityId: id,
          metadata: {
            actorUserId: user.id,
            branchId: id,
            branchName: branch.name,
            branchCode: branch.code,
            oldStatus: previousStatus,
            newStatus: BranchStatus.INACTIVE,
            reason: trimmedReason,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        deletedBranchId: id,
        archived: true,
        message: 'Филиал архивирован',
      };
    });

    return result;
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
    await this.auditHqWarehouseAssignmentInTx(this.prisma, user, branchId, oldWarehouseId, newWarehouseId);
  }

  private async auditHqWarehouseAssignmentInTx(
    tx: Prisma.TransactionClient | PrismaService,
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

    await tx.auditLog.create({
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
