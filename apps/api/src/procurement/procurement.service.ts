import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  FileAttachmentEntityType,
  ProcurementOrderItemStatus,
  ProcurementOrderStatus,
  ProcurementSupplierPaymentStatus,
  Role,
  StockMovementType,
  SvhToHqTransportStatus,
  TransportCompanyStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAllowSupplierOverpayment,
  canCreateSupplierPayment,
  canEditSupplierPayment,
  canVoidSupplierPayment,
  canViewSupplierPayments,
  canManageTransportCompany,
  canViewTransportCompany,
  canManageSvhToHqTransport,
  canViewSvhToHqTransport,
  canConfirmSvhToHqArrival,
  canApproveSvhTransportCostAdjustment,
  canDeleteProcurementOrder,
  isFullAccessRole,
} from '../rbac/rbac';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { UpdateSupplierPaymentDto } from './dto/update-supplier-payment.dto';
import { VoidSupplierPaymentDto } from './dto/void-supplier-payment.dto';
import {
  buildLogisticsWithCargo,
  calculateLandedCosts,
  CARGO_WEIGHT_LESS_THAN_NET,
  extractCargoConfig,
  extractLogisticsCosts,
  LandedCostItemResult,
  LandedCostOrderResult,
  mapStoredProcurementItemToLandedCostInput,
} from './landed-cost.util';
import {
  calculateAmountKgs,
  summarizeSupplierPayments,
} from './supplier-payment.util';
import {
  canUnlockProcurementOrder,
  canUserEditProcurementItems,
  computeSentToSupplierTimestamps,
  computeUnlockExpiry,
  isProcurementOrderCompleted,
  PROCUREMENT_EDIT_WINDOW_EXPIRED_MESSAGE,
  resolveProcurementEditState,
  triggersSentToSupplierWindow,
} from './procurement-edit-window.util';
import { UnlockProcurementOrderDto } from './dto/unlock-procurement-order.dto';
import {
  resolveProcurementLogisticsInput,
  WEIGHTED_YUAN_RATE_REQUIRED_MESSAGE,
} from './transport-logistics.util';
import {
  isSvhEligibleProcurementStatus,
  isSvhTransportCompleted,
  normalizeSvhTransportCostKgs,
  SVH_TRANSPORT_NOT_COMPLETED_MESSAGE,
} from './svh-to-hq-transport.util';
import {
  canEditChinaDomesticTransport,
  CHINA_DOMESTIC_TRANSPORT_LOCKED_MESSAGE,
  computeChinaDomesticTransportUnlockExpiry,
  isChinaDomesticTransportLockedByStatus,
  touchesChinaDomesticTransportFields,
} from './china-domestic-transport-lock.util';

type PreparedProcurementItem = {
  productId: string;
  supplierId: string;
  factoryId: string | null;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  purchasePriceYuan: number;
  yuanRate: number;
  weightKg: number;
  note?: string;
};

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  createSupplier(dto: any) {
    return this.prisma.supplier.create({
      data: {
        name: dto.name,
        companyName: dto.companyName,
        country: dto.country ?? 'China',
        city: dto.city,
        address: dto.address,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        productTypes: dto.productTypes ?? [],
        reliabilityScore: Number(dto.reliabilityScore ?? 0),
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  suppliers() {
    return this.prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  supplier(id: string) {
    return this.prisma.supplier.findFirst({ where: { id, deletedAt: null }, include: { contacts: true, purchaseOrders: true, factories: true, procurementOrders: true } });
  }

  async updateSupplier(user: AuthUser, id: string, dto: any) {
    this.assertCanEditSupplier(user);
    this.validateSupplierPayload(dto);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Supplier not found');
      if (dto.name && dto.name !== existing.name) {
        const duplicate = await tx.supplier.findFirst({
          where: { name: dto.name, deletedAt: null, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) throw new BadRequestException('Supplier name already exists');
      }
      const oldValue = this.pickSupplierAuditFields(existing);
      const nextNotes = this.mergeSupplierNotes(existing.notes, dto);
      const updated = await tx.supplier.update({
        where: { id },
        data: {
          name: dto.name,
          companyName: dto.companyName,
          country: dto.country,
          city: dto.city,
          address: dto.address,
          wechat: dto.wechat,
          phone: dto.phone ?? dto.mobile ?? dto.whatsapp,
          email: dto.email,
          website: dto.website,
          productTypes: Array.isArray(dto.productTypes) ? dto.productTypes : this.splitList(dto.productTypes),
          reliabilityScore: dto.reliabilityScore !== undefined ? Number(dto.reliabilityScore) : undefined,
          isActive: dto.status ? dto.status === 'ACTIVE' : dto.isActive,
          deletedAt: dto.status === 'ARCHIVED' ? new Date() : dto.status === 'ACTIVE' ? null : undefined,
          notes: nextNotes,
        },
      });
      await this.auditSupplierUpdate(tx, user, existing.id, this.changedFields(oldValue, this.pickSupplierAuditFields(updated)), oldValue, this.pickSupplierAuditFields(updated));
      return updated;
    });
  }

  async deleteSupplier(user: AuthUser, id: string, reason?: string) {
    if (!this.hasRole(user, Role.CEO)) {
      throw new ForbiddenException('Only CEO can delete suppliers');
    }

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const [procurementOrders, purchaseOrders, factories, contacts] = await Promise.all([
        tx.procurementOrder.count({ where: { supplierId: id } }),
        tx.purchaseOrder.count({ where: { supplierId: id } }),
        tx.factory.count({ where: { supplierId: id, deletedAt: null } }),
        tx.supplierContact.count({ where: { supplierId: id } }),
      ]);
      const hasPurchaseHistory = procurementOrders > 0 || purchaseOrders > 0 || factories > 0;
      const oldValue = {
        id: supplier.id,
        name: supplier.name,
        deletedAt: supplier.deletedAt,
        isActive: supplier.isActive,
      };

      if (hasPurchaseHistory) {
        const archived = await tx.supplier.update({
          where: { id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await this.auditSupplierDelete(tx, user, supplier, oldValue, {
          deletedAt: archived.deletedAt,
          isActive: archived.isActive,
          archived: true,
        }, reason, { procurementOrders, purchaseOrders, factories, contacts });
        return {
          success: true,
          archived: true,
          message: 'Supplier has related purchase history. It was archived instead.',
        };
      }

      await tx.supplierContact.deleteMany({ where: { supplierId: id } });
      await tx.supplier.delete({ where: { id } });
      await this.auditSupplierDelete(tx, user, supplier, oldValue, {
        deleted: true,
        archived: false,
      }, reason, { procurementOrders, purchaseOrders, factories, contacts });
      return {
        success: true,
        archived: false,
        message: 'Supplier deleted successfully',
      };
    });
  }

  createSupplierContact(supplierId: string, dto: any) {
    return this.prisma.supplierContact.create({
      data: {
        supplierId,
        fullName: dto.fullName,
        position: dto.position,
        role: dto.position,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  supplierContacts(supplierId: string) {
    return this.prisma.supplierContact.findMany({
      where: { supplierId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  updateSupplierContact(id: string, dto: any) {
    return this.prisma.supplierContact.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        position: dto.position,
        role: dto.position,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        isPrimary: dto.isPrimary,
      },
    });
  }

  deleteSupplierContact(id: string) {
    return this.prisma.supplierContact.delete({ where: { id } });
  }

  createFactory(dto: any) {
    return this.prisma.factory.create({
      data: {
        supplierId: dto.supplierId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        productTypes: dto.productTypes ?? [],
        productionCapacity: dto.productionCapacity,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
      include: { supplier: true },
    });
  }

  factories() {
    return this.prisma.factory.findMany({
      where: { deletedAt: null },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  factory(id: string) {
    return this.prisma.factory.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, procurementOrders: true },
    });
  }

  updateFactory(id: string, dto: any) {
    return this.prisma.factory.update({ where: { id }, data: dto, include: { supplier: true } });
  }

  deleteFactory(id: string) {
    return this.prisma.factory.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  createTransportCompany(user: AuthUser, dto: any) {
    this.assertCanManageTransportCompany(user);
    this.validateTransportCompanyPayload(dto);
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.transportCompany.findFirst({
        where: { companyCode: dto.companyCode.trim(), deletedAt: null },
      });
      if (duplicate) throw new BadRequestException('Transport company code already exists');

      const company = await tx.transportCompany.create({
        data: {
          name: dto.name.trim(),
          companyCode: dto.companyCode.trim(),
          country: dto.country?.trim() || null,
          city: dto.city?.trim() || null,
          contactPerson: dto.contactPerson?.trim() || null,
          phone: dto.phone?.trim() || null,
          whatsapp: dto.whatsapp?.trim() || null,
          wechat: dto.wechat?.trim() || null,
          email: dto.email?.trim() || null,
          address: dto.address?.trim() || null,
          transportType: dto.transportType ?? 'UNIVERSAL',
          defaultCurrency: dto.defaultCurrency?.trim() || 'CNY',
          notes: dto.notes?.trim() || null,
          status: dto.status ?? TransportCompanyStatus.ACTIVE,
          createdById: user.id,
        },
        include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      });

      await this.auditTransportCompany(tx, user, 'TRANSPORT_COMPANY_CREATED', company.id, null, this.pickTransportCompanyAuditFields(company));
      return company;
    });
  }

  transportCompanies(user: AuthUser, selectableOnly = false) {
    this.assertCanViewTransportCompany(user);
    return this.prisma.transportCompany.findMany({
      where: {
        deletedAt: null,
        ...(selectableOnly ? { status: TransportCompanyStatus.ACTIVE } : {}),
      },
      include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  transportCompany(user: AuthUser, id: string) {
    this.assertCanViewTransportCompany(user);
    return this.prisma.transportCompany.findFirst({
      where: { id, deletedAt: null },
      include: { createdBy: { select: { id: true, fullName: true, role: true } } },
    });
  }

  updateTransportCompany(user: AuthUser, id: string, dto: any) {
    this.assertCanManageTransportCompany(user);
    this.validateTransportCompanyPayload(dto, { partial: true });
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.transportCompany.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Transport company not found');

      if (dto.companyCode && dto.companyCode.trim() !== existing.companyCode) {
        const duplicate = await tx.transportCompany.findFirst({
          where: { companyCode: dto.companyCode.trim(), deletedAt: null, NOT: { id } },
        });
        if (duplicate) throw new BadRequestException('Transport company code already exists');
      }

      const oldValue = this.pickTransportCompanyAuditFields(existing);
      const updated = await tx.transportCompany.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.companyCode !== undefined ? { companyCode: dto.companyCode.trim() } : {}),
          ...(dto.country !== undefined ? { country: dto.country?.trim() || null } : {}),
          ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
          ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson?.trim() || null } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp?.trim() || null } : {}),
          ...(dto.wechat !== undefined ? { wechat: dto.wechat?.trim() || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
          ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
          ...(dto.transportType !== undefined ? { transportType: dto.transportType } : {}),
          ...(dto.defaultCurrency !== undefined ? { defaultCurrency: dto.defaultCurrency.trim() } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
          ...(dto.status !== undefined
            ? {
                status: dto.status,
                deletedAt:
                  dto.status === TransportCompanyStatus.ARCHIVED
                    ? new Date()
                    : dto.status === TransportCompanyStatus.ACTIVE
                      ? null
                      : existing.deletedAt,
              }
            : {}),
        },
        include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      });

      await this.auditTransportCompany(
        tx,
        user,
        'TRANSPORT_COMPANY_UPDATED',
        updated.id,
        oldValue,
        this.pickTransportCompanyAuditFields(updated),
      );
      return updated;
    });
  }

  archiveTransportCompany(user: AuthUser, id: string, reason?: string) {
    this.assertCanManageTransportCompany(user);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.transportCompany.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Transport company not found');

      const oldValue = this.pickTransportCompanyAuditFields(existing);
      const archived = await tx.transportCompany.update({
        where: { id },
        data: {
          status: TransportCompanyStatus.ARCHIVED,
          deletedAt: new Date(),
        },
      });

      await this.auditTransportCompany(
        tx,
        user,
        'TRANSPORT_COMPANY_ARCHIVED',
        archived.id,
        oldValue,
        this.pickTransportCompanyAuditFields(archived),
        reason,
      );
      return archived;
    });
  }

  async svhToHqTransport(user: AuthUser, orderId: string) {
    this.assertCanViewSvhToHqTransport(user);
    await this.getProcurementOrderForRead(orderId);
    const transport = await this.prisma.procurementSvhToHqTransport.findUnique({
      where: { procurementOrderId: orderId },
      include: {
        transportCompany: true,
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    return transport ? this.toSvhToHqTransportResponse(transport) : null;
  }

  upsertSvhToHqTransport(user: AuthUser, orderId: string, dto: any) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { items: true, supplierPayments: true, svhToHqTransport: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (!isSvhEligibleProcurementStatus(order.status)) {
        throw new BadRequestException('SVH to HQ transport can only be managed after cargo arrives in Kyrgyzstan');
      }

      const existing = order.svhToHqTransport;
      if (!existing && !canManageSvhToHqTransport(user)) {
        throw new ForbiddenException('You do not have permission to create SVH to HQ transport');
      }
      if (existing) {
        this.assertSvhTransportUpdateAllowed(user, dto, order);
      }

      const transportCostKgs = dto.transportCostKgs !== undefined
        ? normalizeSvhTransportCostKgs(dto.transportCostKgs)
        : normalizeSvhTransportCostKgs(existing?.transportCostKgs ?? 0);
      if (dto.transportCostKgs !== undefined && Number(dto.transportCostKgs) < 0) {
        throw new BadRequestException('SVH to HQ transport cost must be greater than or equal to zero');
      }

      const transportCompanyId = dto.transportCompanyId !== undefined
        ? dto.transportCompanyId || null
        : existing?.transportCompanyId ?? null;
      if (transportCompanyId) {
        await this.assertSelectableTransportCompanies(tx, { svhToHqTransportCompanyId: transportCompanyId });
      }

      const nextStatus = dto.status ?? existing?.status ?? SvhToHqTransportStatus.WAITING;
      if (
        order.hqStockMovementCreatedAt &&
        existing &&
        transportCostKgs !== Number(existing.transportCostKgs) &&
        !canApproveSvhTransportCostAdjustment(user)
      ) {
        throw new BadRequestException(
          'Procurement already received to HQ. CEO or Finance approval is required to change SVH transport cost.',
        );
      }

      const oldValue = existing ? this.pickSvhTransportAuditFields(existing) : null;
      const data = {
        transportCompanyId,
        transportCostKgs,
        vehicleNumber: dto.vehicleNumber !== undefined ? dto.vehicleNumber?.trim() || null : undefined,
        driverName: dto.driverName !== undefined ? dto.driverName?.trim() || null : undefined,
        driverPhone: dto.driverPhone !== undefined ? dto.driverPhone?.trim() || null : undefined,
        dispatchDate: dto.dispatchDate !== undefined
          ? dto.dispatchDate ? new Date(dto.dispatchDate) : null
          : undefined,
        arrivalDate: dto.arrivalDate !== undefined
          ? dto.arrivalDate ? new Date(dto.arrivalDate) : null
          : undefined,
        status: nextStatus,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      };

      const transport = existing
        ? await tx.procurementSvhToHqTransport.update({
            where: { id: existing.id },
            data,
            include: {
              transportCompany: true,
              createdBy: { select: { id: true, fullName: true, role: true } },
            },
          })
        : await tx.procurementSvhToHqTransport.create({
            data: {
              procurementOrderId: order.id,
              transportCompanyId,
              transportCostKgs,
              vehicleNumber: dto.vehicleNumber?.trim() || null,
              driverName: dto.driverName?.trim() || null,
              driverPhone: dto.driverPhone?.trim() || null,
              dispatchDate: dto.dispatchDate ? new Date(dto.dispatchDate) : null,
              arrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : null,
              status: nextStatus,
              notes: dto.notes?.trim() || null,
              createdById: user.id,
            },
            include: {
              transportCompany: true,
              createdBy: { select: { id: true, fullName: true, role: true } },
            },
          });

      await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          localTransportKgs: transport.transportCostKgs,
          svhToHqTransportCompanyId: transport.transportCompanyId,
        },
      });

      const updatedOrder = await this.recalculateOrderLandedCostAfterSvhChange(
        tx,
        user,
        order.id,
        existing ? 'SVH to HQ transport updated' : 'SVH to HQ transport created',
      );

      await this.auditSvhTransportChanges(
        tx,
        user,
        order.id,
        transport.transportCompanyId,
        oldValue,
        this.pickSvhTransportAuditFields(transport),
        !existing,
      );

      if (isSvhTransportCompleted(transport.status) && !isSvhTransportCompleted(oldValue?.status)) {
        await this.auditProcurement(tx, user, 'HQ_RECEIVING_ENABLED', order.id, oldValue, this.pickSvhTransportAuditFields(transport), undefined, {
          transportCompanyId: transport.transportCompanyId,
        });
      }

      return {
        transport: this.toSvhToHqTransportResponse(transport),
        order: updatedOrder,
      };
    });
  }

  createProcurementOrder(user: AuthUser, dto: any) {
    this.assertCanManageProcurement(user);
    return this.prisma.$transaction(async (tx) => {
      const [supplier, factory, warehouse] = await Promise.all([
        tx.supplier.findFirst({ where: { id: dto.supplierId, deletedAt: null } }),
        dto.factoryId ? tx.factory.findFirst({ where: { id: dto.factoryId, deletedAt: null } }) : Promise.resolve(null),
        tx.warehouse.findFirst({
          where: { id: dto.hqWarehouseId, ...activeHqWarehouseWhere },
        }),
      ]);
      if (!supplier) throw new NotFoundException('Supplier not found');
      if (dto.factoryId && !factory) throw new NotFoundException('Factory not found');
      if (!warehouse) throw new BadRequestException('Active HQ warehouse is required for procurement');

      const itemInputs = dto.items ?? [];
      if (!itemInputs.length) throw new BadRequestException('At least one product is required');

      const exchangeRate = Number(dto.defaultYuanRate ?? dto.exchangeRate ?? dto.yuanRate ?? 0);
      this.validateExchangeRate(exchangeRate);
      await this.assertSelectableTransportCompanies(tx, dto);
      const resolved = this.resolveProcurementLogistics(dto, undefined, exchangeRate);
      const { logistics, cargo, ...transportResolved } = resolved;
      const transportFields = this.buildProcurementTransportFields(dto, undefined, transportResolved);
      const preparedItems: PreparedProcurementItem[] = [];
      for (const item of itemInputs) {
        preparedItems.push(await this.resolveProcurementItemFromProduct(tx, item, supplier.id, factory?.id, exchangeRate));
      }

      const calculated = this.calculateProcurementLandedCosts(preparedItems, logistics, cargo);
      const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);
      const cargoReceipt = this.buildCargoReceiptData(dto);
      const order = await tx.procurementOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `PROC-${Date.now()}`,
          supplierId: supplier.id,
          factoryId: factory?.id,
          hqWarehouseId: warehouse.id,
          status: ProcurementOrderStatus.DRAFT,
          currency: dto.currency ?? 'CNY',
          defaultYuanRate: exchangeRate,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          ...orderTotals,
          ...transportFields,
          remainingYuan: orderTotals.totalYuan,
          ...cargoReceipt,
          estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
          note: dto.note,
          createdById: user.id,
          items: {
            create: calculated.items.map((item, index) =>
              this.mapCalculatedItemToPersisted(preparedItems[index], item, exchangeRate),
            ),
          },
        },
        include: this.procurementOrderInclude(),
      });

      await this.auditProcurement(tx, user, 'CREATE_PROCUREMENT_ORDER', order.id, null, this.pickProcurementAuditFields(order));
      await this.inventoryService.syncProcurementPurchasePricesInTx(tx, user, {
        orderId: order.id,
        items: preparedItems.map((item) => ({
          productId: item.productId,
          purchasePriceYuan: item.purchasePriceYuan,
          supplierId: item.supplierId,
          factoryId: item.factoryId,
        })),
      });
      return this.toProcurementOrderResponse(order);
    });
  }

  procurementOrders() {
    return this.prisma.procurementOrder.findMany({
      where: { deletedAt: null },
      include: this.procurementOrderInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  procurementOrder(id: string) {
    return this.prisma.procurementOrder.findFirst({
      where: { id, deletedAt: null },
      include: this.procurementOrderInclude(),
    }).then((order) => (order ? this.toProcurementOrderResponse(order) : null));
  }

  async supplierPayments(user: AuthUser, orderId: string) {
    this.assertCanViewSupplierPayments(user);
    await this.getProcurementOrderForRead(orderId);
    const payments = await this.prisma.procurementSupplierPayment.findMany({
      where: { procurementOrderId: orderId },
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
        voidedBy: { select: { id: true, fullName: true, role: true } },
        attachments: {
          where: { deletedAt: null },
          include: { uploadedBy: { select: { id: true, fullName: true } } },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
    return payments.map((payment) => this.toSupplierPaymentResponse(payment));
  }

  createSupplierPayment(user: AuthUser, orderId: string, dto: CreateSupplierPaymentDto) {
    this.assertCanCreateSupplierPayment(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getProcurementOrderForWrite(tx, orderId);
      this.validateSupplierPaymentPayload(dto.amountYuan, dto.exchangeRate);
      await this.assertSupplierPaymentAllowed(
        tx,
        user,
        order,
        dto.amountYuan,
        dto.allowOverpayment === true,
      );
      const amountKgs = calculateAmountKgs(dto.amountYuan, dto.exchangeRate);
      const payment = await tx.procurementSupplierPayment.create({
        data: {
          procurementOrderId: order.id,
          supplierId: order.supplierId,
          paymentDate: new Date(dto.paymentDate),
          amountYuan: dto.amountYuan,
          exchangeRate: dto.exchangeRate,
          amountKgs,
          paymentMethod: dto.paymentMethod,
          receiptNumber: dto.receiptNumber?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: user.id,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          attachments: true,
        },
      });
      const updated = await this.syncSupplierPaymentSummaryAndRecalculate(
        tx,
        user,
        order.id,
        'Supplier payment recorded',
      );
      await this.auditProcurement(
        tx,
        user,
        'SUPPLIER_PAYMENT_CREATED',
        order.id,
        null,
        {
          paymentId: payment.id,
          amountYuan: dto.amountYuan,
          exchangeRate: dto.exchangeRate,
          amountKgs,
          paymentMethod: dto.paymentMethod,
        },
      );
      return {
        payment: this.toSupplierPaymentResponse(payment),
        order: updated,
      };
    });
  }

  updateSupplierPayment(
    user: AuthUser,
    orderId: string,
    paymentId: string,
    dto: UpdateSupplierPaymentDto,
  ) {
    this.assertCanEditSupplierPayment(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getProcurementOrderForWrite(tx, orderId);
      const payment = await tx.procurementSupplierPayment.findFirst({
        where: { id: paymentId, procurementOrderId: order.id },
      });
      if (!payment) throw new NotFoundException('Supplier payment not found');
      if (payment.status === ProcurementSupplierPaymentStatus.VOID) {
        throw new BadRequestException('Voided payments cannot be edited');
      }
      const oldValue = this.toSupplierPaymentResponse(payment);
      const amountYuan = dto.amountYuan ?? Number(payment.amountYuan);
      const exchangeRate = dto.exchangeRate ?? Number(payment.exchangeRate);
      this.validateSupplierPaymentPayload(amountYuan, exchangeRate);
      const otherPayments = await tx.procurementSupplierPayment.findMany({
        where: {
          procurementOrderId: order.id,
          status: ProcurementSupplierPaymentStatus.ACTIVE,
          NOT: { id: payment.id },
        },
      });
      const projectedTotal = otherPayments.reduce((sum, row) => sum + Number(row.amountYuan), 0) + amountYuan;
      if (projectedTotal > Number(order.totalYuan) && !dto.allowOverpayment) {
        this.assertCanAllowSupplierOverpayment(user);
      }
      const updatedPayment = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : payment.paymentDate,
          amountYuan,
          exchangeRate,
          amountKgs: calculateAmountKgs(amountYuan, exchangeRate),
          paymentMethod: dto.paymentMethod ?? payment.paymentMethod,
          receiptNumber: dto.receiptNumber !== undefined ? dto.receiptNumber?.trim() || null : payment.receiptNumber,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : payment.notes,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      const updatedOrder = await this.syncSupplierPaymentSummaryAndRecalculate(
        tx,
        user,
        order.id,
        'Supplier payment updated',
      );
      await this.auditProcurement(
        tx,
        user,
        'SUPPLIER_PAYMENT_EDITED',
        order.id,
        oldValue,
        this.toSupplierPaymentResponse(updatedPayment),
      );
      return {
        payment: this.toSupplierPaymentResponse(updatedPayment),
        order: updatedOrder,
      };
    });
  }

  voidSupplierPayment(
    user: AuthUser,
    orderId: string,
    paymentId: string,
    dto: VoidSupplierPaymentDto,
  ) {
    this.assertCanVoidSupplierPayment(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getProcurementOrderForWrite(tx, orderId);
      const payment = await tx.procurementSupplierPayment.findFirst({
        where: { id: paymentId, procurementOrderId: order.id },
      });
      if (!payment) throw new NotFoundException('Supplier payment not found');
      if (payment.status === ProcurementSupplierPaymentStatus.VOID) {
        throw new BadRequestException('Payment is already voided');
      }
      const oldValue = this.toSupplierPaymentResponse(payment);
      const voided = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          status: ProcurementSupplierPaymentStatus.VOID,
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: dto.reason?.trim() || null,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          voidedBy: { select: { id: true, fullName: true, role: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      const updatedOrder = await this.syncSupplierPaymentSummaryAndRecalculate(
        tx,
        user,
        order.id,
        dto.reason?.trim() || 'Supplier payment voided',
      );
      await this.auditProcurement(
        tx,
        user,
        'SUPPLIER_PAYMENT_VOIDED',
        order.id,
        oldValue,
        this.toSupplierPaymentResponse(voided),
        dto.reason,
      );
      return {
        payment: this.toSupplierPaymentResponse(voided),
        order: updatedOrder,
      };
    });
  }

  async procurementAttachments(user: AuthUser, orderId: string, entityType?: FileAttachmentEntityType) {
    this.assertCanViewSupplierPayments(user);
    await this.getProcurementOrderForRead(orderId);
    const attachments = await this.prisma.fileAttachment.findMany({
      where: {
        entityId: orderId,
        deletedAt: null,
        ...(entityType ? { entityType } : {}),
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return attachments;
  }

  async uploadProcurementAttachment(
    user: AuthUser,
    orderId: string,
    request: FastifyRequest,
    entityType: FileAttachmentEntityType,
    supplierPaymentId?: string,
  ) {
    this.assertCanCreateSupplierPayment(user);
    const order = await this.getProcurementOrderForRead(orderId);
    if (supplierPaymentId) {
      const payment = await this.prisma.procurementSupplierPayment.findFirst({
        where: { id: supplierPaymentId, procurementOrderId: order.id },
      });
      if (!payment) throw new NotFoundException('Supplier payment not found');
    }

    let file: MultipartFile | undefined;
    try {
      file = await request.file();
    } catch {
      throw new BadRequestException('File is too large');
    }
    if (!file) throw new BadRequestException('File is required');

    const allowedMimeTypes = new Map<string, string>([
      ['application/pdf', '.pdf'],
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
    ]);
    const extensionFromMime = allowedMimeTypes.get(file.mimetype);
    const originalExtension = extname(file.filename).toLowerCase();
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    if (!extensionFromMime || !allowedExtensions.includes(originalExtension)) {
      throw new BadRequestException('Invalid file format');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('File is too large');
    }

    const uploadDirectory = join(process.cwd(), 'uploads', 'procurement');
    await mkdir(uploadDirectory, { recursive: true });
    const extension = originalExtension === '.jpeg' ? '.jpg' : extensionFromMime;
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(join(uploadDirectory, storedName), buffer);
    const fileUrl = `/uploads/procurement/${storedName}`;

    const attachment = await this.prisma.fileAttachment.create({
      data: {
        entityType,
        entityId: order.id,
        fileName: file.filename,
        fileUrl,
        mimeType: file.mimetype,
        size: buffer.length,
        uploadedById: user.id,
        supplierPaymentId: supplierPaymentId ?? null,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });

    const action =
      entityType === FileAttachmentEntityType.CARGO_RECEIPT
        ? 'CARGO_RECEIPT_UPLOADED'
        : entityType === FileAttachmentEntityType.SUPPLIER_PAYMENT
          ? 'SUPPLIER_PAYMENT_RECEIPT_UPLOADED'
          : 'PROCUREMENT_ATTACHMENT_UPLOADED';

    await this.auditProcurement(this.prisma, user, action, order.id, null, {
      attachmentId: attachment.id,
      entityType,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      supplierPaymentId,
    });

    return attachment;
  }

  async deleteProcurementAttachment(user: AuthUser, orderId: string, attachmentId: string) {
    this.assertCanEditSupplierPayment(user);
    await this.getProcurementOrderForRead(orderId);
    const attachment = await this.prisma.fileAttachment.findFirst({
      where: { id: attachmentId, entityId: orderId, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const deleted = await this.prisma.fileAttachment.update({
      where: { id: attachment.id },
      data: { deletedAt: new Date() },
    });
    await this.auditProcurement(this.prisma, user, 'PROCUREMENT_ATTACHMENT_DELETED', orderId, attachment, {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
    });
    return deleted;
  }

  updateProcurementOrder(user: AuthUser, id: string, dto: any) {
    this.assertCanManageProcurement(user);
    delete dto.localTransportKgs;
    delete dto.svhToHqTransportCompanyId;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Procurement order not found');

      const editState = this.assertProcurementOrderEditable(user, existing, dto);

      const activePaymentCount = await tx.procurementSupplierPayment.count({
        where: { procurementOrderId: id, status: ProcurementSupplierPaymentStatus.ACTIVE },
      });
      if (
        activePaymentCount > 0 &&
        dto.defaultYuanRate !== undefined &&
        Number(dto.defaultYuanRate) !== Number(existing.defaultYuanRate)
      ) {
        throw new BadRequestException(
          'Exchange rate is locked after supplier payments are recorded. Edit or void payments to correct the weighted average rate.',
        );
      }

      const oldValue = this.pickProcurementAuditFields(existing);
      const exchangeRate = dto.defaultYuanRate !== undefined
        ? Number(dto.defaultYuanRate)
        : await this.resolveEffectiveYuanRate(tx, existing);
      this.validateExchangeRate(exchangeRate);
      this.assertProcurementLogisticsEditable(user, existing, dto);
      if (dto.hqWarehouseId && dto.hqWarehouseId !== existing.hqWarehouseId) {
        const warehouse = await tx.warehouse.findFirst({
          where: { id: dto.hqWarehouseId, ...activeHqWarehouseWhere },
        });
        if (!warehouse) throw new BadRequestException('Active HQ warehouse is required for procurement');
      }
      await this.assertSelectableTransportCompanies(tx, dto, existing);
      const resolved = this.resolveProcurementLogistics(dto, existing, exchangeRate);
      const { logistics, cargo, ...transportResolved } = resolved;
      const transportFields = this.buildProcurementTransportFields(dto, existing, transportResolved);
      const cargoReceipt = this.buildCargoReceiptData(dto, existing);
      let priceSyncItems: Array<{
        productId: string;
        purchasePriceYuan: number;
        supplierId?: string | null;
        factoryId?: string | null;
      }> | null = null;

      const nextSupplierId = dto.supplierId ?? existing.supplierId;
      const nextFactoryId = dto.factoryId !== undefined ? dto.factoryId ?? null : existing.factoryId;
      const nextNote = dto.note !== undefined ? dto.note ?? null : existing.note;

      if (dto.supplierId && dto.supplierId !== existing.supplierId) {
        await this.auditProcurementItemChange(
          tx,
          user,
          id,
          null,
          'PROCUREMENT_SUPPLIER_CHANGED',
          { supplierId: existing.supplierId },
          { supplierId: dto.supplierId },
          dto.reason,
        );
      }
      if (dto.factoryId !== undefined && dto.factoryId !== existing.factoryId) {
        await this.auditProcurementItemChange(
          tx,
          user,
          id,
          null,
          'PROCUREMENT_FACTORY_CHANGED',
          { factoryId: existing.factoryId },
          { factoryId: dto.factoryId ?? null },
          dto.reason,
        );
      }

      if (Array.isArray(dto.items)) {
        if (existing.sentToSupplierAt) {
          const syncResult = await this.syncProcurementOrderItemsInTx(
            tx,
            user,
            id,
            existing.items,
            dto.items,
            nextSupplierId,
            nextFactoryId,
            exchangeRate,
            logistics,
            cargo,
            dto.reason,
          );
          priceSyncItems = syncResult.priceSyncItems;
          const orderTotals = this.buildProcurementOrderTotals(syncResult.calculated, logistics, cargo);
          await tx.procurementOrder.update({
            where: { id },
            data: {
              supplierId: nextSupplierId,
              factoryId: nextFactoryId,
              hqWarehouseId: dto.hqWarehouseId ?? existing.hqWarehouseId,
              currency: dto.currency ?? existing.currency,
              defaultYuanRate: exchangeRate,
              purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : existing.purchaseDate,
              ...orderTotals,
              ...transportFields,
              remainingYuan: orderTotals.totalYuan,
              ...cargoReceipt,
              estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : existing.estimatedArrivalDate,
              note: nextNote,
            },
          });
        } else {
          await tx.procurementOrderItem.deleteMany({ where: { orderId: id } });
          const preparedItems: PreparedProcurementItem[] = [];
          for (const item of dto.items) {
            preparedItems.push(await this.resolveProcurementItemFromProduct(
              tx,
              item,
              nextSupplierId,
              nextFactoryId,
              exchangeRate,
            ));
          }
          priceSyncItems = preparedItems.map((item) => ({
            productId: item.productId,
            purchasePriceYuan: item.purchasePriceYuan,
            supplierId: item.supplierId,
            factoryId: item.factoryId,
          }));
          const calculated = this.calculateProcurementLandedCosts(preparedItems, logistics, cargo);
          const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);
          await tx.procurementOrderItem.createMany({
            data: calculated.items.map((item, index) => ({
              orderId: id,
              ...this.mapCalculatedItemToPersisted(preparedItems[index], item, exchangeRate),
            })),
          });
          await tx.procurementOrder.update({
            where: { id },
            data: {
              supplierId: nextSupplierId,
              factoryId: nextFactoryId,
              hqWarehouseId: dto.hqWarehouseId ?? existing.hqWarehouseId,
              currency: dto.currency ?? existing.currency,
              defaultYuanRate: exchangeRate,
              purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : existing.purchaseDate,
              ...orderTotals,
              ...transportFields,
              remainingYuan: orderTotals.totalYuan,
              ...cargoReceipt,
              estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : existing.estimatedArrivalDate,
              note: nextNote,
            },
          });
        }
      } else {
        const activeItems = this.activeProcurementItems(existing.items);
        const recalculated = this.calculateProcurementLandedCosts(
          activeItems.map((item) => mapStoredProcurementItemToLandedCostInput({
            ...item,
            yuanRate: exchangeRate,
          })),
          logistics,
          cargo,
        );
        const orderTotals = this.buildProcurementOrderTotals(recalculated, logistics, cargo);
        for (const [index, item] of activeItems.entries()) {
          const next = recalculated.items[index];
          await tx.procurementOrderItem.update({
            where: { id: item.id },
            data: this.mapRecalculatedItemFields(next, exchangeRate),
          });
        }
        await tx.procurementOrder.update({
          where: { id },
          data: {
            supplierId: nextSupplierId,
            factoryId: nextFactoryId,
            hqWarehouseId: dto.hqWarehouseId ?? existing.hqWarehouseId,
            currency: dto.currency ?? existing.currency,
            defaultYuanRate: exchangeRate,
            purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : existing.purchaseDate,
            ...orderTotals,
            ...transportFields,
            remainingYuan: orderTotals.totalYuan,
            ...cargoReceipt,
            estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : existing.estimatedArrivalDate,
            note: nextNote,
          },
        });
      }

      const updated = await tx.procurementOrder.findUnique({
        where: { id },
        include: this.procurementOrderInclude(),
      });
      await this.auditProcurement(
        tx,
        user,
        'UPDATE_PROCUREMENT_ORDER',
        id,
        oldValue,
        this.pickProcurementAuditFields(updated),
        dto.reason,
      );
      await this.auditProcurementLogisticsChanges(tx, user, id, oldValue, this.pickProcurementAuditFields(updated));
      if (priceSyncItems?.length) {
        await this.inventoryService.syncProcurementPurchasePricesInTx(tx, user, {
          orderId: id,
          items: priceSyncItems,
        });
      }
      const paymentCount = await tx.procurementSupplierPayment.count({
        where: { procurementOrderId: id, status: ProcurementSupplierPaymentStatus.ACTIVE },
      });
      if (paymentCount > 0) {
        return this.syncSupplierPaymentSummaryAndRecalculate(tx, user, id, dto.reason ?? 'Procurement order updated');
      }
      return this.toProcurementOrderResponse(updated);
    });
  }

  recalculateProcurementOrder(user: AuthUser, id: string, reason?: string) {
    this.assertCanManageProcurement(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      const oldValue = this.pickProcurementAuditFields(order);
      const exchangeRate = await this.resolveEffectiveYuanRate(tx, order);
      const resolved = this.resolveProcurementLogistics(order, undefined, exchangeRate);
      const { logistics, cargo, ...transportResolved } = resolved;
      const activeItems = this.activeProcurementItems(order.items);
      const calculated = this.calculateProcurementLandedCosts(
        activeItems.map((item) => mapStoredProcurementItemToLandedCostInput({
          ...item,
          yuanRate: exchangeRate,
        })),
        logistics,
        cargo,
      );
      const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);
      for (const [index, item] of activeItems.entries()) {
        const next = calculated.items[index];
        await tx.procurementOrderItem.update({
          where: { id: item.id },
          data: this.mapRecalculatedItemFields(next, exchangeRate),
        });
      }
      const updated = await tx.procurementOrder.update({
        where: { id },
        data: {
          ...orderTotals,
          ...this.buildProcurementTransportFields(order, order, transportResolved),
        },
        include: this.procurementOrderInclude(),
      });
      await this.auditProcurement(tx, user, 'RECALCULATE_PROCUREMENT_LANDED_COST', id, oldValue, this.pickProcurementAuditFields(updated), reason);
      const paymentCount = await tx.procurementSupplierPayment.count({
        where: { procurementOrderId: id, status: ProcurementSupplierPaymentStatus.ACTIVE },
      });
      if (paymentCount > 0) {
        return this.syncSupplierPaymentSummaryAndRecalculate(tx, user, id, reason ?? 'Procurement landed cost recalculated');
      }
      return this.toProcurementOrderResponse(updated);
    });
  }

  procurementOrderAuditLogs(id: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entity: 'ProcurementOrder',
        entityId: id,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { timestamp: 'desc' },
    });
  }

  updateProcurementStatus(user: AuthUser, id: string, status: ProcurementOrderStatus, reason?: string) {
    if (status === ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE) {
      throw new BadRequestException('Use receive-to-hq workflow to post inventory into HQ warehouse');
    }
    if (status === ProcurementOrderStatus.ARRIVED) {
      return this.markProcurementArrived(user, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
      if (!existing) throw new NotFoundException('Procurement order not found');
      const oldValue = this.pickProcurementAuditFields(existing);
      const data: any = { status };
      if (status === ProcurementOrderStatus.APPROVED) {
        data.approvedById = user.id;
        data.approvedAt = new Date();
      }
      if (status === ProcurementOrderStatus.PAID) data.paidAt = new Date();
      if (status === ProcurementOrderStatus.SHIPPED_TO_YIWU) data.shippedAt = new Date();
      if (triggersSentToSupplierWindow(status) && !existing.sentToSupplierAt) {
        const timestamps = computeSentToSupplierTimestamps();
        data.sentToSupplierAt = timestamps.sentToSupplierAt;
        data.editableUntil = timestamps.editableUntil;
      }
      const updated = await tx.procurementOrder.update({ where: { id }, data, include: this.procurementOrderInclude() });
      await this.auditProcurement(tx, user, 'PROCUREMENT_STATUS_CHANGE', id, oldValue, this.pickProcurementAuditFields(updated), reason, { status });
      if (
        isChinaDomesticTransportLockedByStatus(status) &&
        !isChinaDomesticTransportLockedByStatus(existing.status)
      ) {
        await this.auditProcurement(
          tx,
          user,
          'CHINA_DOMESTIC_TRANSPORT_LOCKED',
          id,
          { status: existing.status },
          { status },
          reason,
        );
      }
      return this.toProcurementOrderResponse(updated);
    });
  }

  unlockProcurementOrder(user: AuthUser, id: string, dto: UnlockProcurementOrderDto) {
    if (!canUnlockProcurementOrder(user)) {
      throw new ForbiddenException('Only CEO can unlock procurement orders');
    }
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Unlock reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Procurement order not found');
      if (!existing.sentToSupplierAt || !existing.editableUntil) {
        throw new BadRequestException('Edit window has not started for this procurement order');
      }
      if (existing.hqStockMovementCreatedAt || isProcurementOrderCompleted(existing)) {
        throw new BadRequestException('Completed or received procurement orders cannot be unlocked');
      }

      const editState = resolveProcurementEditState(existing);
      if (editState.editWindowStatus === 'EDITABLE') {
        throw new BadRequestException('Procurement order is still within the 24-hour edit window');
      }

      const now = new Date();
      const unlockExpiresAt = computeUnlockExpiry(now);
      const updated = await tx.procurementOrder.update({
        where: { id },
        data: {
          unlockedById: user.id,
          unlockedAt: now,
          unlockExpiresAt,
          unlockReason: reason,
        },
        include: this.procurementOrderInclude(),
      });

      await this.auditProcurement(
        tx,
        user,
        'PROCUREMENT_ORDER_UNLOCKED',
        id,
        {
          unlockedById: existing.unlockedById,
          unlockedAt: existing.unlockedAt,
          unlockExpiresAt: existing.unlockExpiresAt,
        },
        {
          unlockedById: user.id,
          unlockedAt: now,
          unlockExpiresAt,
          unlockReason: reason,
        },
        reason,
      );

      return this.toProcurementOrderResponse(updated);
    });
  }

  unlockChinaDomesticTransport(user: AuthUser, id: string, dto: UnlockProcurementOrderDto) {
    if (!canUnlockProcurementOrder(user)) {
      throw new ForbiddenException('Only CEO can unlock China domestic transport');
    }
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Unlock reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Procurement order not found');
      if (!isChinaDomesticTransportLockedByStatus(existing.status)) {
        throw new BadRequestException('China domestic transport is not locked for this procurement order');
      }
      if (existing.hqStockMovementCreatedAt || isProcurementOrderCompleted(existing)) {
        throw new BadRequestException('Completed or received procurement orders cannot be unlocked');
      }

      const now = new Date();
      const unlockExpiresAt = computeChinaDomesticTransportUnlockExpiry(now);
      const updated = await tx.procurementOrder.update({
        where: { id },
        data: {
          chinaDomesticTransportUnlockedById: user.id,
          chinaDomesticTransportUnlockedAt: now,
          chinaDomesticTransportUnlockExpiresAt: unlockExpiresAt,
          chinaDomesticTransportUnlockReason: reason,
        },
        include: this.procurementOrderInclude(),
      });

      await this.auditProcurement(
        tx,
        user,
        'CHINA_DOMESTIC_TRANSPORT_UNLOCKED',
        id,
        {
          chinaDomesticTransportUnlockedById: existing.chinaDomesticTransportUnlockedById,
          chinaDomesticTransportUnlockedAt: existing.chinaDomesticTransportUnlockedAt,
          chinaDomesticTransportUnlockExpiresAt: existing.chinaDomesticTransportUnlockExpiresAt,
          chinaDomesticTransportUnlockReason: existing.chinaDomesticTransportUnlockReason,
        },
        {
          chinaDomesticTransportUnlockedById: user.id,
          chinaDomesticTransportUnlockedAt: now,
          chinaDomesticTransportUnlockExpiresAt: unlockExpiresAt,
          chinaDomesticTransportUnlockReason: reason,
        },
        reason,
      );

      return this.toProcurementOrderResponse(updated);
    });
  }

  deleteProcurementOrder(user: AuthUser, id: string, reason?: string) {
    if (!canDeleteProcurementOrder(user)) {
      throw new ForbiddenException('Only CEO can delete procurement orders');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true, svhToHqTransport: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');

      const [
        supplierPayments,
        receivings,
        attachments,
        costAdjustments,
      ] = await Promise.all([
        tx.procurementSupplierPayment.count({ where: { procurementOrderId: id } }),
        tx.procurementGoodsReceiving.count({ where: { procurementOrderId: id, deletedAt: null } }),
        tx.fileAttachment.count({ where: { entityId: id, deletedAt: null } }),
        tx.procurementCostAdjustment.count({ where: { procurementOrderId: id } }),
      ]);

      const hasCargoReceipt = !!(
        order.cargoReceiptNumber ||
        order.cargoReceiptDate ||
        order.cargoCompany ||
        Number(order.cargoTotalWeightKg) > 0 ||
        Number(order.totalCargoCostKgs) > 0
      );
      const hasBusinessHistory =
        supplierPayments > 0 ||
        receivings > 0 ||
        attachments > 0 ||
        costAdjustments > 0 ||
        !!order.hqStockMovementCreatedAt ||
        !!order.sentToSupplierAt ||
        !!order.svhToHqTransport ||
        hasCargoReceipt ||
        order.status !== 'DRAFT';

      const oldValue = this.pickProcurementAuditFields(order);

      if (!hasBusinessHistory && order.status === 'DRAFT') {
        await tx.procurementOrder.delete({ where: { id } });
        await this.auditProcurement(tx, user, 'PROCUREMENT_ORDER_DELETED', id, oldValue, { deleted: true }, reason);
        return { success: true, archived: false };
      }

      const trimmedReason = reason?.trim();
      if (!trimmedReason) {
        throw new BadRequestException('Reason is required when archiving a procurement order with related records');
      }

      const archived = await tx.procurementOrder.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: order.status === 'CANCELLED' ? order.status : ProcurementOrderStatus.CANCELLED,
        },
      });
      await this.auditProcurement(
        tx,
        user,
        'PROCUREMENT_ORDER_ARCHIVED',
        id,
        oldValue,
        this.pickProcurementAuditFields(archived),
        trimmedReason,
      );
      return { success: true, archived: true };
    });
  }

  markSentToSupplier(user: AuthUser, id: string, reason?: string) {
    return this.updateProcurementStatus(user, id, ProcurementOrderStatus.SENT_TO_SUPPLIER, reason);
  }

  private markProcurementArrived(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { hqWarehouse: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.hqStockMovementCreatedAt || order.status === ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE) {
        return this.prisma.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
      }
      if (!order.hqWarehouse || !isHqWarehouse(order.hqWarehouse) || !order.hqWarehouse.isActive) {
        throw new BadRequestException('Procurement order must target an active HQ warehouse');
      }

      return tx.procurementOrder.update({
        where: { id },
        data: {
          status: ProcurementOrderStatus.ARRIVED,
          arrivedAt: new Date(),
          actualArrivalDate: new Date(),
        },
        include: this.procurementOrderInclude(),
      });
    });
  }

  createPurchaseOrder(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = dto.items ?? [];
    const totalYuan = items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0) * Number(item.unitPriceYuan ?? 0), 0);
    const totalKgs = Number(dto.totalKgs ?? 0);
    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        branchId,
        orderNumber: dto.orderNumber ?? `PO-${Date.now()}`,
        status: dto.status,
        totalYuan,
        totalKgs,
        estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
        items: { create: items.map((item: any) => ({
          productName: item.productName,
          sku: item.sku,
          quantity: Number(item.quantity ?? 0),
          unitPriceYuan: Number(item.unitPriceYuan ?? 0),
          totalYuan: Number(item.quantity ?? 0) * Number(item.unitPriceYuan ?? 0),
          weightKg: Number(item.weightKg ?? 0),
        })) },
      },
      include: { supplier: true, branch: true, items: true },
    });
  }

  purchaseOrders(user: AuthUser) {
    return this.prisma.purchaseOrder.findMany({
      where: this.canAccessAllProcurement(user) ? {} : { branchId: user.branchId },
      include: { supplier: true, branch: true, items: true, shipments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  purchaseOrder(user: AuthUser, id: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { id, ...(this.canAccessAllProcurement(user) ? {} : { branchId: user.branchId }) },
      include: { supplier: true, branch: true, items: true, shipments: { include: { events: true } } },
    });
  }

  updateStatus(user: AuthUser, id: string, dto: any) {
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: dto.status },
      include: { supplier: true, branch: true, items: true },
    });
  }

  createShipment(dto: any) {
    return this.prisma.logisticsShipment.create({
      data: {
        purchaseOrderId: dto.purchaseOrderId,
        shipmentNumber: dto.shipmentNumber ?? `SHIP-${Date.now()}`,
        carrier: dto.carrier,
        originCity: dto.originCity,
        destinationCity: dto.destinationCity,
        status: dto.status,
        estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
      },
      include: { purchaseOrder: true },
    });
  }

  shipments() {
    return this.prisma.logisticsShipment.findMany({
      include: { purchaseOrder: true, events: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private procurementOrderInclude() {
    return {
      supplier: true,
      factory: true,
      hqWarehouse: true,
      chinaDomesticTransportCompany: true,
      chinaExportTransportCompany: true,
      svhToHqTransport: { include: { transportCompany: true, createdBy: { select: { id: true, fullName: true, role: true } } } },
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      unlockedBy: { select: { id: true, fullName: true, role: true } },
      chinaDomesticTransportUnlockedBy: { select: { id: true, fullName: true, role: true } },
      items: { include: { product: true, supplier: true, factory: true }, orderBy: { createdAt: 'asc' as const } },
      receivings: { include: { items: true }, orderBy: { createdAt: 'desc' as const } },
      differenceReports: { orderBy: { createdAt: 'desc' as const } },
      supplierPayments: {
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          voidedBy: { select: { id: true, fullName: true, role: true } },
          attachments: { where: { deletedAt: null } },
        },
        orderBy: { paymentDate: 'desc' as const },
      },
      costAdjustments: { orderBy: { createdAt: 'desc' as const }, take: 10 },
    };
  }

  private assertCanManageProcurement(user: AuthUser) {
    if (this.canManageProcurement(user)) return;
    throw new ForbiddenException('You do not have permission to manage procurement orders');
  }

  private canManageProcurement(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((role) =>
      isFullAccessRole(role) ||
      role === Role.PROCUREMENT_MANAGER ||
      role === Role.SUPPLY_CHAIN_MANAGER
    );
  }

  private canViewProcurementCosts(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return this.canManageProcurement(user) ||
      roles.some((role) => role === Role.FINANCE_MANAGER || role === Role.ACCOUNTANT || role === Role.WAREHOUSE_MANAGER);
  }

  assertCanViewProcurement(user: AuthUser) {
    if (this.canViewProcurementCosts(user)) return;
    throw new ForbiddenException('You do not have permission to view procurement orders');
  }

  private assertProcurementOrderEditable(user: AuthUser, order: any, dto: any) {
    if (order.hqStockMovementCreatedAt) {
      throw new BadRequestException('Received procurement orders cannot be edited');
    }
    if (isProcurementOrderCompleted(order)) {
      throw new BadRequestException('Completed procurement orders cannot be edited');
    }

    const editState = resolveProcurementEditState(order);
    const headerChanged =
      (dto.supplierId !== undefined && dto.supplierId !== order.supplierId) ||
      (dto.factoryId !== undefined && dto.factoryId !== order.factoryId) ||
      (dto.note !== undefined && dto.note !== order.note);
    const itemsChanged = Array.isArray(dto.items);

    if (!order.sentToSupplierAt) {
      return editState;
    }

    if (itemsChanged || headerChanged) {
      if (!canUserEditProcurementItems(user, editState)) {
        if (editState.editWindowStatus === 'LOCKED') {
          throw new BadRequestException(PROCUREMENT_EDIT_WINDOW_EXPIRED_MESSAGE);
        }
        throw new ForbiddenException('You do not have permission to edit this procurement order');
      }
    }

    return editState;
  }

  private activeProcurementItems(items: any[]) {
    return items.filter((item) => item.status !== ProcurementOrderItemStatus.CANCELLED);
  }

  private async canHardDeleteProcurementItem(tx: any, item: any) {
    if ((item.receivedQuantity ?? 0) > 0) {
      return false;
    }
    const receivingCount = await tx.procurementGoodsReceivingItem.count({
      where: { procurementItemId: item.id },
    });
    return receivingCount === 0;
  }

  private auditProcurementItemChange(
    tx: any,
    user: AuthUser,
    procurementOrderId: string,
    itemId: string | null,
    action: string,
    oldValue: unknown,
    newValue: unknown,
    reason?: string,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'ProcurementOrder',
        entityId: procurementOrderId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          procurementOrderId,
          itemId,
          oldValue,
          newValue,
          reason: reason?.trim() || null,
        },
      },
    });
  }

  private async syncProcurementOrderItemsInTx(
    tx: any,
    user: AuthUser,
    orderId: string,
    existingItems: any[],
    dtoItems: any[],
    orderSupplierId: string,
    orderFactoryId: string | null,
    exchangeRate: number,
    logistics: ReturnType<typeof extractLogisticsCosts>,
    cargo: ReturnType<typeof extractCargoConfig>,
    reason?: string,
  ) {
    const activeExisting = this.activeProcurementItems(existingItems);
    const existingById = new Map(activeExisting.map((item) => [item.id, item]));
    const incomingIds = new Set(
      dtoItems.map((item) => item.id).filter((id: string | undefined) => !!id),
    );
    const priceSyncItems: Array<{
      productId: string;
      purchasePriceYuan: number;
      supplierId?: string | null;
      factoryId?: string | null;
    }> = [];

    for (const dtoItem of dtoItems) {
      const prepared = await this.resolveProcurementItemFromProduct(
        tx,
        dtoItem,
        orderSupplierId,
        orderFactoryId,
        exchangeRate,
      );
      priceSyncItems.push({
        productId: prepared.productId,
        purchasePriceYuan: prepared.purchasePriceYuan,
        supplierId: prepared.supplierId,
        factoryId: prepared.factoryId,
      });

      if (dtoItem.id && existingById.has(dtoItem.id)) {
        const existing = existingById.get(dtoItem.id)!;
        if (existing.quantity !== prepared.quantity) {
          await this.auditProcurementItemChange(
            tx,
            user,
            orderId,
            existing.id,
            'PROCUREMENT_ITEM_QUANTITY_CHANGED',
            { quantity: existing.quantity },
            { quantity: prepared.quantity },
            reason,
          );
        }
        if (Number(existing.purchasePriceYuan) !== prepared.purchasePriceYuan) {
          await this.auditProcurementItemChange(
            tx,
            user,
            orderId,
            existing.id,
            'PROCUREMENT_ITEM_PRICE_CHANGED',
            { purchasePriceYuan: existing.purchasePriceYuan },
            { purchasePriceYuan: prepared.purchasePriceYuan },
            reason,
          );
        }
        await tx.procurementOrderItem.update({
          where: { id: existing.id },
          data: {
            productId: prepared.productId,
            supplierId: prepared.supplierId,
            factoryId: prepared.factoryId,
            sku: prepared.sku,
            productName: prepared.productName,
            unit: prepared.unit,
            quantity: prepared.quantity,
            purchasePriceYuan: prepared.purchasePriceYuan,
            yuanRate: exchangeRate,
            weightKg: prepared.weightKg,
            note: prepared.note,
            status: ProcurementOrderItemStatus.ACTIVE,
          },
        });
      } else {
        const created = await tx.procurementOrderItem.create({
          data: {
            orderId,
            productId: prepared.productId,
            supplierId: prepared.supplierId,
            factoryId: prepared.factoryId,
            sku: prepared.sku,
            productName: prepared.productName,
            unit: prepared.unit,
            quantity: prepared.quantity,
            purchasePriceYuan: prepared.purchasePriceYuan,
            yuanRate: exchangeRate,
            costKgs: 0,
            weightKg: prepared.weightKg,
            netWeightKg: prepared.weightKg,
            transportCostKgs: 0,
            finalCostKgs: 0,
            totalYuan: prepared.quantity * prepared.purchasePriceYuan,
            totalCostKgs: 0,
            note: prepared.note,
            status: ProcurementOrderItemStatus.ACTIVE,
          },
        });
        await this.auditProcurementItemChange(
          tx,
          user,
          orderId,
          created.id,
          'PROCUREMENT_ITEM_ADDED',
          null,
          {
            productId: prepared.productId,
            sku: prepared.sku,
            quantity: prepared.quantity,
            purchasePriceYuan: prepared.purchasePriceYuan,
          },
          reason,
        );
      }
    }

    for (const existing of activeExisting) {
      if (incomingIds.has(existing.id)) {
        continue;
      }
      const canDelete = await this.canHardDeleteProcurementItem(tx, existing);
      if (canDelete) {
        await tx.procurementOrderItem.delete({ where: { id: existing.id } });
        await this.auditProcurementItemChange(
          tx,
          user,
          orderId,
          existing.id,
          'PROCUREMENT_ITEM_REMOVED',
          {
            productId: existing.productId,
            sku: existing.sku,
            quantity: existing.quantity,
          },
          null,
          reason,
        );
      } else {
        await tx.procurementOrderItem.update({
          where: { id: existing.id },
          data: { status: ProcurementOrderItemStatus.CANCELLED },
        });
        await this.auditProcurementItemChange(
          tx,
          user,
          orderId,
          existing.id,
          'PROCUREMENT_ITEM_CANCELLED',
          { status: ProcurementOrderItemStatus.ACTIVE },
          { status: ProcurementOrderItemStatus.CANCELLED },
          reason,
        );
      }
    }

    const activeItems = await tx.procurementOrderItem.findMany({
      where: { orderId, status: ProcurementOrderItemStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    const calculated = this.calculateProcurementLandedCosts(
      activeItems.map((item: any) => mapStoredProcurementItemToLandedCostInput({
        ...item,
        yuanRate: exchangeRate,
      })),
      logistics,
      cargo,
    );

    for (const [index, item] of activeItems.entries()) {
      const next = calculated.items[index];
      await tx.procurementOrderItem.update({
        where: { id: item.id },
        data: this.mapRecalculatedItemFields(next, exchangeRate),
      });
    }

    return { calculated, priceSyncItems };
  }

  private pickProcurementAuditFields(order: any) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      supplierId: order.supplierId,
      factoryId: order.factoryId,
      hqWarehouseId: order.hqWarehouseId,
      sentToSupplierAt: order.sentToSupplierAt,
      editableUntil: order.editableUntil,
      unlockedById: order.unlockedById,
      unlockedAt: order.unlockedAt,
      unlockExpiresAt: order.unlockExpiresAt,
      unlockReason: order.unlockReason,
      chinaDomesticTransportUnlockedAt: order.chinaDomesticTransportUnlockedAt,
      chinaDomesticTransportUnlockExpiresAt: order.chinaDomesticTransportUnlockExpiresAt,
      chinaDomesticTransportUnlockReason: order.chinaDomesticTransportUnlockReason,
      currency: order.currency,
      purchaseDate: order.purchaseDate,
      exchangeRate: order.defaultYuanRate?.toString?.() ?? order.defaultYuanRate,
      defaultYuanRate: order.defaultYuanRate?.toString?.() ?? order.defaultYuanRate,
      defaultUsdRate: order.defaultUsdRate?.toString?.() ?? order.defaultUsdRate,
      cargoRateUsdPerKg: order.cargoRateUsdPerKg?.toString?.() ?? order.cargoRateUsdPerKg,
      cargoTotalWeightKg: order.cargoTotalWeightKg?.toString?.() ?? order.cargoTotalWeightKg,
      cargoCompany: order.cargoCompany,
      cargoReceiptNumber: order.cargoReceiptNumber,
      cargoReceiptDate: order.cargoReceiptDate,
      cargoReceiptNote: order.cargoReceiptNote,
      totalCargoCostUsd: order.totalCargoCostUsd?.toString?.() ?? order.totalCargoCostUsd,
      totalCargoCostKgs: order.totalCargoCostKgs?.toString?.() ?? order.totalCargoCostKgs,
      totalNetWeightKg: order.totalNetWeightKg?.toString?.() ?? order.totalNetWeightKg,
      totalPackagingWeightKg: order.totalPackagingWeightKg?.toString?.() ?? order.totalPackagingWeightKg,
      totalYuan: order.totalYuan?.toString?.() ?? order.totalYuan,
      totalPaidYuan: order.totalPaidYuan?.toString?.() ?? order.totalPaidYuan,
      totalPaidKgs: order.totalPaidKgs?.toString?.() ?? order.totalPaidKgs,
      remainingYuan: order.remainingYuan?.toString?.() ?? order.remainingYuan,
      weightedAverageYuanRate: order.weightedAverageYuanRate?.toString?.() ?? order.weightedAverageYuanRate,
      supplierPaymentStatus: order.supplierPaymentStatus,
      totalTransportCostKgs: order.totalTransportCostKgs?.toString?.() ?? order.totalTransportCostKgs,
      totalCostKgs: order.totalCostKgs?.toString?.() ?? order.totalCostKgs,
      totalWeightKg: order.totalWeightKg?.toString?.() ?? order.totalWeightKg,
      costPerKg: order.costPerKg?.toString?.() ?? order.costPerKg,
      chinaDomesticTransportYuan: order.chinaDomesticTransportYuan?.toString?.() ?? order.chinaDomesticTransportYuan,
      chinaDomesticTransportKgs: order.chinaDomesticTransportKgs?.toString?.() ?? order.chinaDomesticTransportKgs,
      chinaDomesticTransportCompanyId: order.chinaDomesticTransportCompanyId,
      chinaExportTransportCompanyId: order.chinaExportTransportCompanyId,
      svhToHqTransportCompanyId: order.svhToHqTransportCompanyId,
      chinaExportTransportKgs: order.chinaExportTransportKgs?.toString?.() ?? order.chinaExportTransportKgs,
      localTransportKgs: order.localTransportKgs?.toString?.() ?? order.localTransportKgs,
      packagingCostKgs: order.packagingCostKgs?.toString?.() ?? order.packagingCostKgs,
      customsCostKgs: order.customsCostKgs?.toString?.() ?? order.customsCostKgs,
      insuranceCostKgs: order.insuranceCostKgs?.toString?.() ?? order.insuranceCostKgs,
      bankFeeCostKgs: order.bankFeeCostKgs?.toString?.() ?? order.bankFeeCostKgs,
      otherExpenseKgs: order.otherExpenseKgs?.toString?.() ?? order.otherExpenseKgs,
      items: order.items?.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        status: item.status,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        purchasePriceYuan: item.purchasePriceYuan?.toString?.() ?? item.purchasePriceYuan,
        yuanRate: item.yuanRate?.toString?.() ?? item.yuanRate,
        weightKg: item.weightKg?.toString?.() ?? item.weightKg,
        netWeightKg: item.netWeightKg?.toString?.() ?? item.netWeightKg,
        packagingWeightKg: item.packagingWeightKg?.toString?.() ?? item.packagingWeightKg,
        packagingType: item.packagingType,
        directPackagingCostKgs: item.directPackagingCostKgs?.toString?.() ?? item.directPackagingCostKgs,
        finalCostKgs: item.finalCostKgs?.toString?.() ?? item.finalCostKgs,
      })),
    };
  }

  private auditProcurement(
    tx: any,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
    reason?: string,
    extra?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'ProcurementOrder',
        entityId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          oldValue,
          newValue,
          reason: reason?.trim() || null,
          ...extra,
        },
      },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (this.canAccessAllProcurement(user)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private canAccessAllProcurement(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((role) =>
      isFullAccessRole(role) ||
      role === Role.PROCUREMENT_MANAGER ||
      role === Role.SUPPLY_CHAIN_MANAGER
    );
  }

  private hasRole(user: AuthUser, role: Role) {
    return (user.roles?.length ? user.roles : [user.role]).includes(role);
  }

  private assertCanEditSupplier(user: AuthUser) {
    if (!this.hasRole(user, Role.CEO) && !this.hasRole(user, Role.SUPPLY_CHAIN_MANAGER)) {
      throw new ForbiddenException('You do not have permission to edit suppliers');
    }
  }

  private validateExchangeRate(rate: number) {
    if (!rate || rate <= 0) {
      throw new BadRequestException('Exchange rate is required and must be greater than zero');
    }
  }

  private async resolveProcurementItemFromProduct(
    tx: any,
    item: {
      productId: string;
      quantity?: number;
      purchasePriceYuan?: number;
      note?: string;
    },
    orderSupplierId: string,
    orderFactoryId: string | null | undefined,
    exchangeRate: number,
  ): Promise<PreparedProcurementItem> {
    const product = await tx.product.findFirst({ where: { id: item.productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');
    const weightKg = Number(product.weightKg);
    if (!weightKg || weightKg <= 0) {
      throw new BadRequestException(
        `Product weight is not configured for ${product.sku} (${product.name}). Please configure weight in Product Management.`,
      );
    }
    const quantity = Number(item.quantity ?? 0);
    if (quantity <= 0) {
      throw new BadRequestException(`Quantity must be greater than zero for ${product.sku}`);
    }
    return {
      productId: product.id,
      supplierId: product.defaultSupplierId ?? orderSupplierId,
      factoryId: product.defaultFactoryId ?? orderFactoryId ?? null,
      sku: product.sku,
      productName: product.name,
      unit: product.unit ?? 'pcs',
      quantity,
      purchasePriceYuan: Number(item.purchasePriceYuan ?? product.purchasePriceYuan ?? 0),
      yuanRate: exchangeRate,
      weightKg,
      note: item.note,
    };
  }

  private resolveProcurementLogistics(dto: any, existing?: any, effectiveYuanRate?: number) {
    const rate = effectiveYuanRate ?? Number(dto.defaultYuanRate ?? existing?.defaultYuanRate ?? 0);
    if (Number(dto.chinaDomesticTransportYuan ?? existing?.chinaDomesticTransportYuan ?? 0) < 0) {
      throw new BadRequestException('China domestic transport cost in yuan must be greater than or equal to zero');
    }
    if (Number(dto.localTransportKgs ?? existing?.localTransportKgs ?? 0) < 0) {
      throw new BadRequestException('SVH to HQ transport cost must be greater than or equal to zero');
    }

    try {
      const resolved = resolveProcurementLogisticsInput(dto, existing, rate);
      this.validateCargoConfig(resolved.cargo);
      return resolved;
    } catch (error) {
      if (error instanceof Error && error.message === 'WEIGHTED_YUAN_RATE_REQUIRED') {
        throw new BadRequestException(WEIGHTED_YUAN_RATE_REQUIRED_MESSAGE);
      }
      if (error instanceof Error && error.message === 'NEGATIVE_LOCAL_TRANSPORT') {
        throw new BadRequestException('SVH to HQ transport cost must be greater than or equal to zero');
      }
      throw error;
    }
  }

  private buildProcurementTransportFields(
    dto: any,
    existing: any | undefined,
    resolved: {
      chinaDomesticTransportYuan: number;
      chinaDomesticTransportKgs: number;
    },
  ) {
    return {
      chinaDomesticTransportYuan: resolved.chinaDomesticTransportYuan,
      chinaDomesticTransportKgs: resolved.chinaDomesticTransportKgs,
      chinaDomesticTransportCompanyId: this.resolveOptionalRelationId(
        dto.chinaDomesticTransportCompanyId,
        existing?.chinaDomesticTransportCompanyId,
      ),
      chinaExportTransportCompanyId: this.resolveOptionalRelationId(
        dto.chinaExportTransportCompanyId,
        existing?.chinaExportTransportCompanyId,
      ),
    };
  }

  private resolveOptionalRelationId(next?: string | null, existing?: string | null) {
    if (next === undefined) return existing ?? null;
    return next || null;
  }

  private async assertSelectableTransportCompanies(tx: any, dto: any, existing?: any) {
    const companyIds = [
      this.resolveOptionalRelationId(dto.chinaDomesticTransportCompanyId, existing?.chinaDomesticTransportCompanyId),
      this.resolveOptionalRelationId(dto.chinaExportTransportCompanyId, existing?.chinaExportTransportCompanyId),
      dto.svhToHqTransportCompanyId || dto.transportCompanyId || null,
    ].filter(Boolean) as string[];

    if (!companyIds.length) return;

    const companies = await tx.transportCompany.findMany({
      where: { id: { in: companyIds }, deletedAt: null },
      select: { id: true, status: true, name: true },
    });

    for (const companyId of companyIds) {
      const company = companies.find((entry: { id: string }) => entry.id === companyId);
      if (!company) {
        throw new BadRequestException('Selected transport company was not found');
      }
      if (company.status !== TransportCompanyStatus.ACTIVE) {
        throw new BadRequestException(`Transport company "${company.name}" is not active and cannot be selected`);
      }
    }
  }

  private assertCanManageTransportCompany(user: AuthUser) {
    if (canManageTransportCompany(user)) return;
    throw new ForbiddenException('You do not have permission to manage transport companies');
  }

  private assertCanViewTransportCompany(user: AuthUser) {
    if (canViewTransportCompany(user)) return;
    throw new ForbiddenException('You do not have permission to view transport companies');
  }

  private validateTransportCompanyPayload(dto: any, options?: { partial?: boolean }) {
    const partial = options?.partial ?? false;
    if (!partial && !dto.name?.trim()) {
      throw new BadRequestException('Transport company name is required');
    }
    if (!partial && !dto.companyCode?.trim()) {
      throw new BadRequestException('Transport company code is required');
    }
    if (dto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }
  }

  private pickTransportCompanyAuditFields(company: any) {
    return {
      id: company.id,
      name: company.name,
      companyCode: company.companyCode,
      country: company.country,
      city: company.city,
      contactPerson: company.contactPerson,
      phone: company.phone,
      whatsapp: company.whatsapp,
      wechat: company.wechat,
      email: company.email,
      address: company.address,
      transportType: company.transportType,
      defaultCurrency: company.defaultCurrency,
      notes: company.notes,
      status: company.status,
    };
  }

  private auditTransportCompany(
    tx: any,
    user: AuthUser,
    action: string,
    transportCompanyId: string,
    oldValue: unknown,
    newValue: unknown,
    reason?: string,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'TransportCompany',
        entityId: transportCompanyId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          transportCompanyId,
          oldValue,
          newValue,
          reason: reason?.trim() || null,
        },
      },
    });
  }

  private buildCargoReceiptData(dto: any, existing?: any) {
    const has = (key: string) => dto[key] !== undefined;
    return {
      ...(has('cargoTotalWeightKg') ? { cargoTotalWeightKg: Number(dto.cargoTotalWeightKg ?? 0) } : existing ? { cargoTotalWeightKg: existing.cargoTotalWeightKg } : {}),
      ...(has('cargoCompany') ? { cargoCompany: dto.cargoCompany?.trim() || null } : existing ? { cargoCompany: existing.cargoCompany } : {}),
      ...(has('cargoReceiptNumber') ? { cargoReceiptNumber: dto.cargoReceiptNumber?.trim() || null } : existing ? { cargoReceiptNumber: existing.cargoReceiptNumber } : {}),
      ...(has('cargoReceiptDate') ? { cargoReceiptDate: dto.cargoReceiptDate ? new Date(dto.cargoReceiptDate) : null } : existing ? { cargoReceiptDate: existing.cargoReceiptDate } : {}),
      ...(has('cargoReceiptNote') ? { cargoReceiptNote: dto.cargoReceiptNote?.trim() || null } : existing ? { cargoReceiptNote: existing.cargoReceiptNote } : {}),
    };
  }

  private assertProcurementLogisticsEditable(user: AuthUser, order: any, dto: any) {
    if (!touchesChinaDomesticTransportFields(dto)) {
      return;
    }
    if (canEditChinaDomesticTransport(order)) {
      return;
    }
    throw new ForbiddenException(CHINA_DOMESTIC_TRANSPORT_LOCKED_MESSAGE);
  }

  private calculateProcurementLandedCosts(
    items: Array<{
      quantity: number;
      receivedQuantity?: number | null;
      purchasePriceYuan: number;
      yuanRate: number;
      weightKg: number;
    }>,
    logistics: ReturnType<typeof extractLogisticsCosts>,
    cargo: ReturnType<typeof extractCargoConfig>,
  ) {
    try {
      return calculateLandedCosts(items, logistics, { cargo });
    } catch (error) {
      if (error instanceof Error && error.message === CARGO_WEIGHT_LESS_THAN_NET) {
        throw new BadRequestException('Cargo total weight cannot be less than product net weight.');
      }
      throw error;
    }
  }

  private buildProcurementOrderTotals(
    calculated: LandedCostOrderResult,
    logistics: ReturnType<typeof extractLogisticsCosts>,
    cargo: ReturnType<typeof extractCargoConfig>,
  ) {
    const cargoTotalWeightKg = Number(cargo.cargoTotalWeightKg ?? 0);
    const { logistics: resolvedLogistics } = buildLogisticsWithCargo(
      logistics,
      cargoTotalWeightKg,
      cargo,
    );
    return {
      ...resolvedLogistics,
      defaultUsdRate: cargo.usdRate,
      cargoRateUsdPerKg: cargo.cargoRateUsdPerKg,
      cargoTotalWeightKg,
      totalCargoCostUsd: calculated.totalCargoCostUsd,
      totalCargoCostKgs: calculated.totalCargoCostKgs,
      totalNetWeightKg: calculated.totalNetWeightKg,
      totalPackagingWeightKg: calculated.totalPackagingWeightKg,
      totalYuan: calculated.totalYuan,
      totalTransportCostKgs: calculated.totalTransportCostKgs,
      totalCostKgs: calculated.totalCostKgs,
      totalWeightKg: calculated.totalShipmentWeightKg,
      costPerKg: calculated.costPerKg,
    };
  }

  private mapCalculatedItemToPersisted(
    prepared: PreparedProcurementItem,
    item: LandedCostItemResult,
    exchangeRate: number,
  ) {
    return {
      productId: prepared.productId,
      supplierId: prepared.supplierId,
      factoryId: prepared.factoryId,
      sku: prepared.sku,
      productName: prepared.productName,
      unit: prepared.unit,
      quantity: prepared.quantity,
      purchasePriceYuan: item.purchasePriceYuan,
      yuanRate: exchangeRate,
      costKgs: item.costKgs,
      weightKg: item.netWeightKg,
      netWeightKg: item.netWeightKg,
      packagingWeightKg: item.packagingWeightKg ?? 0,
      packagingType: null,
      directPackagingCostKgs: 0,
      totalWeightKg: item.lineShipmentWeightKg ?? item.totalWeightKg,
      chinaDomesticAllocKgs: item.chinaDomesticAllocKgs,
      chinaExportAllocKgs: item.chinaExportAllocKgs,
      localTransportAllocKgs: item.localTransportAllocKgs,
      packagingAllocKgs: item.packagingAllocKgs,
      customsAllocKgs: item.customsAllocKgs,
      insuranceAllocKgs: item.insuranceAllocKgs,
      bankFeeAllocKgs: item.bankFeeAllocKgs,
      otherAllocKgs: item.otherAllocKgs,
      transportCostKgs: item.transportCostKgs,
      finalCostKgs: item.finalCostKgs,
      totalYuan: item.totalYuan,
      totalCostKgs: item.totalCostKgs,
      note: prepared.note,
    };
  }

  private mapRecalculatedItemFields(item: LandedCostItemResult, exchangeRate: number) {
    return {
      yuanRate: exchangeRate,
      costKgs: item.costKgs,
      weightKg: item.netWeightKg,
      netWeightKg: item.netWeightKg,
      packagingWeightKg: item.packagingWeightKg ?? 0,
      totalWeightKg: item.lineShipmentWeightKg ?? item.totalWeightKg,
      chinaDomesticAllocKgs: item.chinaDomesticAllocKgs,
      chinaExportAllocKgs: item.chinaExportAllocKgs,
      localTransportAllocKgs: item.localTransportAllocKgs,
      packagingAllocKgs: item.packagingAllocKgs,
      customsAllocKgs: item.customsAllocKgs,
      insuranceAllocKgs: item.insuranceAllocKgs,
      bankFeeAllocKgs: item.bankFeeAllocKgs,
      otherAllocKgs: item.otherAllocKgs,
      transportCostKgs: item.transportCostKgs,
      finalCostKgs: item.finalCostKgs,
      totalYuan: item.totalYuan,
      totalCostKgs: item.totalCostKgs,
    };
  }

  private validateCargoConfig(cargo: ReturnType<typeof extractCargoConfig>) {
    if (cargo.cargoRateUsdPerKg > 0 && (!cargo.usdRate || cargo.usdRate <= 0)) {
      throw new BadRequestException('USD exchange rate is required when cargo tariff is set');
    }
    if (Number(cargo.cargoTotalWeightKg ?? 0) > 0 && cargo.cargoRateUsdPerKg <= 0) {
      throw new BadRequestException('Cargo tariff rate is required when cargo total weight is set');
    }
  }

  private auditProcurementLogisticsChanges(
    tx: any,
    user: AuthUser,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    const audits: Array<{ action: string; extra?: Record<string, unknown> }> = [];
    if (String(oldValue?.defaultUsdRate ?? '') !== String(newValue?.defaultUsdRate ?? '')) {
      audits.push({
        action: 'USD_EXCHANGE_RATE_CHANGED',
        extra: { field: 'defaultUsdRate', oldValue: oldValue?.defaultUsdRate, newValue: newValue?.defaultUsdRate },
      });
    }
    if (String(oldValue?.cargoRateUsdPerKg ?? '') !== String(newValue?.cargoRateUsdPerKg ?? '')) {
      audits.push({
        action: 'CARGO_TARIFF_RATE_CHANGED',
        extra: { field: 'cargoRateUsdPerKg', oldValue: oldValue?.cargoRateUsdPerKg, newValue: newValue?.cargoRateUsdPerKg },
      });
    }
    if (String(oldValue?.cargoTotalWeightKg ?? '') !== String(newValue?.cargoTotalWeightKg ?? '')) {
      audits.push({
        action: 'CARGO_TOTAL_WEIGHT_CHANGED',
        extra: { field: 'cargoTotalWeightKg', oldValue: oldValue?.cargoTotalWeightKg, newValue: newValue?.cargoTotalWeightKg },
      });
    }
    if (String(oldValue?.chinaDomesticTransportYuan ?? '') !== String(newValue?.chinaDomesticTransportYuan ?? '')) {
      audits.push({
        action: 'CHINA_DOMESTIC_TRANSPORT_CHANGED',
        extra: {
          field: 'chinaDomesticTransportYuan',
          oldValue: oldValue?.chinaDomesticTransportYuan,
          newValue: newValue?.chinaDomesticTransportYuan,
        },
      });
    }
    if (String(oldValue?.chinaDomesticTransportKgs ?? '') !== String(newValue?.chinaDomesticTransportKgs ?? '')) {
      audits.push({
        action: 'CHINA_DOMESTIC_TRANSPORT_KGS_RECALCULATED',
        extra: { field: 'chinaDomesticTransportKgs', oldValue: oldValue?.chinaDomesticTransportKgs, newValue: newValue?.chinaDomesticTransportKgs },
      });
    }
    if (String(oldValue?.chinaDomesticTransportCompanyId ?? '') !== String(newValue?.chinaDomesticTransportCompanyId ?? '')) {
      audits.push({
        action: 'PROCUREMENT_TRANSPORT_COMPANY_SELECTED',
        extra: {
          field: 'chinaDomesticTransportCompanyId',
          transportCompanyId: newValue?.chinaDomesticTransportCompanyId,
          oldValue: oldValue?.chinaDomesticTransportCompanyId,
          newValue: newValue?.chinaDomesticTransportCompanyId,
        },
      });
    }
    if (String(oldValue?.chinaExportTransportCompanyId ?? '') !== String(newValue?.chinaExportTransportCompanyId ?? '')) {
      audits.push({
        action: 'PROCUREMENT_TRANSPORT_COMPANY_SELECTED',
        extra: {
          field: 'chinaExportTransportCompanyId',
          transportCompanyId: newValue?.chinaExportTransportCompanyId,
          oldValue: oldValue?.chinaExportTransportCompanyId,
          newValue: newValue?.chinaExportTransportCompanyId,
        },
      });
    }
    if (String(oldValue?.svhToHqTransportCompanyId ?? '') !== String(newValue?.svhToHqTransportCompanyId ?? '')) {
      audits.push({
        action: 'PROCUREMENT_TRANSPORT_COMPANY_SELECTED',
        extra: {
          field: 'svhToHqTransportCompanyId',
          transportCompanyId: newValue?.svhToHqTransportCompanyId,
          oldValue: oldValue?.svhToHqTransportCompanyId,
          newValue: newValue?.svhToHqTransportCompanyId,
        },
      });
    }
    if (String(oldValue?.hqWarehouseId ?? '') !== String(newValue?.hqWarehouseId ?? '')) {
      audits.push({
        action: 'WAREHOUSE_SELECTED',
        extra: { field: 'hqWarehouseId', oldValue: oldValue?.hqWarehouseId, newValue: newValue?.hqWarehouseId },
      });
    }
    const logisticsChanged = audits.length > 0 ||
      String(oldValue?.totalCostKgs ?? '') !== String(newValue?.totalCostKgs ?? '');
    if (logisticsChanged) {
      audits.push({ action: 'LANDED_COST_RECALCULATED' });
    }
    return Promise.all(audits.map((entry) =>
      this.auditProcurement(tx, user, entry.action, entityId, oldValue, newValue, undefined, entry.extra),
    ));
  }

  private validateSupplierPayload(dto: any) {
    if (!dto.name?.trim()) throw new BadRequestException('Supplier name is required');
    if (dto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }
    const phone = dto.phone ?? dto.mobile ?? dto.whatsapp;
    if (phone && !/^[+\d\s().-]{5,}$/.test(String(phone))) {
      throw new BadRequestException('Invalid phone format');
    }
    if (dto.website && !/^https?:\/\/.+\..+/.test(dto.website)) {
      throw new BadRequestException('Invalid website format');
    }
  }

  private mergeSupplierNotes(existingNotes: string | null, dto: any) {
    const extras = {
      contactPerson: dto.contactPerson,
      mobile: dto.mobile,
      whatsapp: dto.whatsapp,
      telegram: dto.telegram,
      supplierType: dto.supplierType,
      moq: dto.moq,
      leadTimeDays: dto.leadTimeDays,
      currency: dto.currency,
      paymentTerms: dto.paymentTerms,
      incoterms: dto.incoterms,
      bankInformation: dto.bankInformation,
      taxNumber: dto.taxNumber,
      qualityScore: dto.qualityScore,
      deliveryScore: dto.deliveryScore,
      overallRating: dto.overallRating,
      publicNotes: dto.publicNotes,
      files: dto.files,
    };
    const cleanExtras = Object.fromEntries(
      Object.entries(extras).filter(([, value]) => value !== undefined && value !== ''),
    );
    const internalNotes = dto.notes ?? existingNotes ?? '';
    return JSON.stringify({ internalNotes, ...cleanExtras });
  }

  private splitList(value: unknown) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return undefined;
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  private pickSupplierAuditFields(supplier: any) {
    return {
      name: supplier.name,
      companyName: supplier.companyName,
      country: supplier.country,
      city: supplier.city,
      address: supplier.address,
      wechat: supplier.wechat,
      phone: supplier.phone,
      email: supplier.email,
      website: supplier.website,
      productTypes: supplier.productTypes,
      reliabilityScore: supplier.reliabilityScore?.toString?.() ?? supplier.reliabilityScore,
      notes: supplier.notes,
      isActive: supplier.isActive,
      deletedAt: supplier.deletedAt,
    };
  }

  private changedFields(oldValue: Record<string, unknown>, newValue: Record<string, unknown>) {
    return Object.keys(newValue).filter((key) => JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key]));
  }

  private auditSupplierUpdate(
    tx: any,
    user: AuthUser,
    supplierId: string,
    changedFields: string[],
    oldValue: unknown,
    newValue: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'UPDATE_SUPPLIER',
        entity: 'Supplier',
        entityId: supplierId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          supplierId,
          changedFields,
          oldValue,
          newValue,
        },
      },
    });
  }

  private auditSupplierDelete(
    tx: any,
    user: AuthUser,
    supplier: { id: string; name: string },
    oldValue: unknown,
    newValue: unknown,
    reason: string | undefined,
    relationCounts: Record<string, number>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'DELETE_SUPPLIER',
        entity: 'Supplier',
        entityId: supplier.id,
        metadata: {
          actorUserId: user.id,
          actorRole: Role.CEO,
          supplierId: supplier.id,
          supplierName: supplier.name,
          oldValue,
          newValue,
          reason: reason?.trim() || null,
          relationCounts,
        },
      },
    });
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async getProcurementOrderForRead(orderId: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    return order;
  }

  private async getProcurementOrderForWrite(tx: any, orderId: string) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    return order;
  }

  private assertCanViewSupplierPayments(user: AuthUser) {
    if (!canViewSupplierPayments(user)) {
      throw new ForbiddenException('You do not have permission to view supplier payments');
    }
  }

  private assertCanCreateSupplierPayment(user: AuthUser) {
    if (!canCreateSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to create supplier payments');
    }
  }

  private assertCanEditSupplierPayment(user: AuthUser) {
    if (!canEditSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to edit supplier payments');
    }
  }

  private assertCanVoidSupplierPayment(user: AuthUser) {
    if (!canVoidSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to void supplier payments');
    }
  }

  private assertCanAllowSupplierOverpayment(user: AuthUser) {
    if (!canAllowSupplierOverpayment(user)) {
      throw new BadRequestException('Overpayment requires Finance Manager or CEO approval');
    }
  }

  private validateSupplierPaymentPayload(amountYuan: number, exchangeRate: number) {
    if (!amountYuan || amountYuan <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    this.validateExchangeRate(exchangeRate);
  }

  private async assertSupplierPaymentAllowed(
    tx: any,
    user: AuthUser,
    order: { id: string; totalYuan: any },
    amountYuan: number,
    allowOverpayment: boolean,
  ) {
    const payments = await tx.procurementSupplierPayment.findMany({
      where: {
        procurementOrderId: order.id,
        status: ProcurementSupplierPaymentStatus.ACTIVE,
      },
    });
    const summary = summarizeSupplierPayments(payments, Number(order.totalYuan));
    const projectedTotal = summary.totalPaidYuan + amountYuan;
    if (projectedTotal > Number(order.totalYuan) && !allowOverpayment) {
      this.assertCanAllowSupplierOverpayment(user);
    }
  }

  private async resolveEffectiveYuanRate(tx: any, order: { id: string; defaultYuanRate: any }) {
    const payments = await tx.procurementSupplierPayment.findMany({
      where: {
        procurementOrderId: order.id,
        status: ProcurementSupplierPaymentStatus.ACTIVE,
      },
    });
    const summary = summarizeSupplierPayments(payments, 0);
    if (summary.weightedAverageYuanRate && summary.totalPaidYuan > 0) {
      return summary.weightedAverageYuanRate;
    }
    return Number(order.defaultYuanRate);
  }

  private async syncSupplierPaymentSummaryAndRecalculate(
    tx: any,
    user: AuthUser,
    orderId: string,
    reason: string,
  ) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: true, supplierPayments: true },
    });
    if (!order) throw new NotFoundException('Procurement order not found');

    const oldValue = this.pickProcurementAuditFields(order);
    const summary = summarizeSupplierPayments(order.supplierPayments, Number(order.totalYuan));
    const effectiveRate =
      summary.weightedAverageYuanRate && summary.totalPaidYuan > 0
        ? summary.weightedAverageYuanRate
        : Number(order.defaultYuanRate);
    const resolved = this.resolveProcurementLogistics(order, undefined, effectiveRate);
    const { logistics, cargo, ...transportResolved } = resolved;
    const calculated = this.calculateProcurementLandedCosts(
      order.items.map((item: any) => mapStoredProcurementItemToLandedCostInput({
        ...item,
        yuanRate: effectiveRate,
      })),
      logistics,
      cargo,
    );
    const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);

    for (const [index, item] of order.items.entries()) {
      const next = calculated.items[index];
      await tx.procurementOrderItem.update({
        where: { id: item.id },
        data: this.mapRecalculatedItemFields(next, effectiveRate),
      });
    }

    const updated = await tx.procurementOrder.update({
      where: { id: order.id },
      data: {
        ...orderTotals,
        ...this.buildProcurementTransportFields(order, order, transportResolved),
        totalPaidYuan: summary.totalPaidYuan,
        totalPaidKgs: summary.totalPaidKgs,
        remainingYuan: summary.remainingYuan,
        weightedAverageYuanRate: summary.weightedAverageYuanRate,
        supplierPaymentStatus: summary.supplierPaymentStatus,
        paidAt:
          summary.supplierPaymentStatus === 'PAID' || summary.supplierPaymentStatus === 'OVERPAID'
            ? order.paidAt ?? new Date()
            : order.paidAt,
      },
      include: this.procurementOrderInclude(),
    });

    if (
      order.hqStockMovementCreatedAt &&
      Number(oldValue.totalCostKgs) !== Number(updated.totalCostKgs)
    ) {
      await tx.procurementCostAdjustment.create({
        data: {
          procurementOrderId: order.id,
          oldTotalCostKgs: Number(oldValue.totalCostKgs),
          newTotalCostKgs: Number(updated.totalCostKgs),
          oldWeightedRate: oldValue.weightedAverageYuanRate
            ? Number(oldValue.weightedAverageYuanRate)
            : null,
          newWeightedRate: summary.weightedAverageYuanRate,
          reason,
          createdById: user.id,
        },
      });
      await this.auditProcurement(tx, user, 'PROCUREMENT_COST_ADJUSTMENT', order.id, {
        oldTotalCostKgs: oldValue.totalCostKgs,
        oldWeightedRate: oldValue.weightedAverageYuanRate,
      }, {
        newTotalCostKgs: updated.totalCostKgs,
        newWeightedRate: summary.weightedAverageYuanRate,
        reason,
      });
    }

    await this.auditProcurement(
      tx,
      user,
      'WEIGHTED_AVERAGE_RATE_RECALCULATED',
      order.id,
      {
        weightedAverageYuanRate: oldValue.weightedAverageYuanRate,
        totalPaidYuan: oldValue.totalPaidYuan,
        supplierPaymentStatus: oldValue.supplierPaymentStatus,
      },
      {
        weightedAverageYuanRate: summary.weightedAverageYuanRate,
        totalPaidYuan: summary.totalPaidYuan,
        totalPaidKgs: summary.totalPaidKgs,
        remainingYuan: summary.remainingYuan,
        supplierPaymentStatus: summary.supplierPaymentStatus,
        effectiveYuanRate: effectiveRate,
      },
      reason,
    );
    await this.auditProcurement(
      tx,
      user,
      'LANDED_COST_RECALCULATED',
      order.id,
      oldValue,
      this.pickProcurementAuditFields(updated),
      reason,
    );

    return this.toProcurementOrderResponse(updated);
  }

  private toSupplierPaymentResponse(payment: any) {
    return {
      ...payment,
      amountYuan: Number(payment.amountYuan),
      exchangeRate: Number(payment.exchangeRate),
      amountKgs: Number(payment.amountKgs),
    };
  }

  private async toProcurementOrderResponse(order: any) {
    const attachments = await this.prisma.fileAttachment.findMany({
      where: { entityId: order.id, deletedAt: null },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const activePaymentCount = order.supplierPayments
      ? order.supplierPayments.filter(
          (payment: any) => payment.status === ProcurementSupplierPaymentStatus.ACTIVE,
        ).length
      : await this.prisma.procurementSupplierPayment.count({
          where: { procurementOrderId: order.id, status: ProcurementSupplierPaymentStatus.ACTIVE },
        });

    return {
      ...order,
      totalYuan: Number(order.totalYuan),
      totalPaidYuan: Number(order.totalPaidYuan ?? 0),
      totalPaidKgs: Number(order.totalPaidKgs ?? 0),
      remainingYuan: Number(order.remainingYuan ?? 0),
      weightedAverageYuanRate: order.weightedAverageYuanRate
        ? Number(order.weightedAverageYuanRate)
        : null,
      defaultYuanRate: Number(order.defaultYuanRate),
      chinaDomesticTransportYuan: Number(order.chinaDomesticTransportYuan ?? 0),
      chinaDomesticTransportKgs: Number(order.chinaDomesticTransportKgs ?? 0),
      chinaDomesticTransportLocked: isChinaDomesticTransportLockedByStatus(order.status),
      chinaDomesticTransportEditable: canEditChinaDomesticTransport(order),
      chinaDomesticTransportUnlockExpiresAt: order.chinaDomesticTransportUnlockExpiresAt,
      chinaDomesticTransportUnlockReason: order.chinaDomesticTransportUnlockReason,
      chinaDomesticTransportUnlockedBy: order.chinaDomesticTransportUnlockedBy,
      localTransportKgs: Number(order.localTransportKgs ?? 0),
      yuanRateLocked: activePaymentCount > 0,
      effectiveYuanRate:
        order.weightedAverageYuanRate && Number(order.totalPaidYuan) > 0
          ? Number(order.weightedAverageYuanRate)
          : Number(order.defaultYuanRate),
      ...(() => {
        const editState = resolveProcurementEditState(order);
        return {
          sentToSupplierAt: order.sentToSupplierAt,
          editableUntil: order.editableUntil,
          unlockedAt: order.unlockedAt,
          unlockExpiresAt: order.unlockExpiresAt,
          unlockReason: order.unlockReason,
          isEditable: editState.isEditable,
          editWindowStatus: editState.editWindowStatus,
          secondsRemaining: editState.secondsRemaining,
        };
      })(),
      supplierPayments: order.supplierPayments?.map((payment: any) =>
        this.toSupplierPaymentResponse(payment),
      ),
      attachments,
      cargoAttachments: attachments.filter(
        (attachment) => attachment.entityType === FileAttachmentEntityType.CARGO_RECEIPT,
      ),
      svhToHqTransport: order.svhToHqTransport
        ? this.toSvhToHqTransportResponse(order.svhToHqTransport)
        : null,
      canReceiveToHq: isSvhTransportCompleted(order.svhToHqTransport?.status),
    };
  }

  private toSvhToHqTransportResponse(transport: any) {
    return {
      ...transport,
      transportCostKgs: Number(transport.transportCostKgs ?? 0),
    };
  }

  private pickSvhTransportAuditFields(transport: any) {
    return {
      id: transport.id,
      procurementOrderId: transport.procurementOrderId,
      transportCompanyId: transport.transportCompanyId,
      transportCostKgs: transport.transportCostKgs?.toString?.() ?? transport.transportCostKgs,
      vehicleNumber: transport.vehicleNumber,
      driverName: transport.driverName,
      driverPhone: transport.driverPhone,
      dispatchDate: transport.dispatchDate,
      arrivalDate: transport.arrivalDate,
      status: transport.status,
      notes: transport.notes,
    };
  }

  private assertCanViewSvhToHqTransport(user: AuthUser) {
    if (canViewSvhToHqTransport(user)) return;
    throw new ForbiddenException('You do not have permission to view SVH to HQ transport');
  }

  private assertSvhTransportUpdateAllowed(user: AuthUser, dto: any, order: any) {
    if (canManageSvhToHqTransport(user)) return;
    if (!canConfirmSvhToHqArrival(user)) {
      throw new ForbiddenException('You do not have permission to update SVH to HQ transport');
    }
    const restrictedFields = [
      'transportCostKgs',
      'transportCompanyId',
      'vehicleNumber',
      'driverName',
      'driverPhone',
      'dispatchDate',
      'notes',
    ];
    const touchedRestricted = restrictedFields.some((field) => dto[field] !== undefined);
    if (touchedRestricted) {
      throw new ForbiddenException('Warehouse managers can only confirm SVH arrival and completion status');
    }
    if (dto.status !== undefined && dto.status !== SvhToHqTransportStatus.COMPLETED) {
      throw new ForbiddenException('Warehouse managers can only mark SVH to HQ transport as completed');
    }
    if (order.hqStockMovementCreatedAt) {
      throw new BadRequestException('Procurement stock has already been received');
    }
  }

  private auditSvhTransportChanges(
    tx: any,
    user: AuthUser,
    procurementOrderId: string,
    transportCompanyId: string | null,
    oldValue: any,
    newValue: any,
    created: boolean,
  ) {
    const audits: Array<{ action: string; extra?: Record<string, unknown> }> = [];
    if (created) {
      audits.push({ action: 'SVH_TRANSPORT_CREATED' });
    }
    if (oldValue && String(oldValue.transportCompanyId ?? '') !== String(newValue.transportCompanyId ?? '')) {
      audits.push({
        action: 'SVH_TRANSPORT_COMPANY_CHANGED',
        extra: {
          transportCompanyId: newValue.transportCompanyId,
          oldValue: oldValue.transportCompanyId,
          newValue: newValue.transportCompanyId,
        },
      });
    }
    if (oldValue && String(oldValue.transportCostKgs ?? '') !== String(newValue.transportCostKgs ?? '')) {
      audits.push({
        action: 'SVH_TRANSPORT_COST_CHANGED',
        extra: {
          oldValue: oldValue.transportCostKgs,
          newValue: newValue.transportCostKgs,
        },
      });
    }
    if (oldValue && oldValue.status !== newValue.status) {
      audits.push({
        action: 'SVH_TRANSPORT_STATUS_CHANGED',
        extra: { oldValue: oldValue.status, newValue: newValue.status },
      });
      if (newValue.status === SvhToHqTransportStatus.COMPLETED) {
        audits.push({ action: 'SVH_TRANSPORT_ARRIVAL_CONFIRMED' });
      }
    } else if (!oldValue && newValue.arrivalDate) {
      audits.push({ action: 'SVH_TRANSPORT_ARRIVAL_CONFIRMED' });
    }
    audits.push({ action: 'LANDED_COST_RECALCULATED' });

    return Promise.all(audits.map((entry) =>
      this.auditProcurement(tx, user, entry.action, procurementOrderId, oldValue, newValue, undefined, {
        transportCompanyId,
        ...entry.extra,
      }),
    ));
  }

  private async recalculateOrderLandedCostAfterSvhChange(
    tx: any,
    user: AuthUser,
    orderId: string,
    reason: string,
  ) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: true, supplierPayments: true, svhToHqTransport: true },
    });
    if (!order) throw new NotFoundException('Procurement order not found');

    const oldValue = this.pickProcurementAuditFields(order);
    const summary = summarizeSupplierPayments(order.supplierPayments, Number(order.totalYuan));
    const effectiveRate =
      summary.weightedAverageYuanRate && summary.totalPaidYuan > 0
        ? summary.weightedAverageYuanRate
        : Number(order.defaultYuanRate);
    const resolved = this.resolveProcurementLogistics(order, undefined, effectiveRate);
    const { logistics, cargo, ...transportResolved } = resolved;
    const calculated = this.calculateProcurementLandedCosts(
      order.items.map((item: any) => mapStoredProcurementItemToLandedCostInput({
        ...item,
        yuanRate: effectiveRate,
      })),
      logistics,
      cargo,
    );
    const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);

    for (const [index, item] of order.items.entries()) {
      const next = calculated.items[index];
      await tx.procurementOrderItem.update({
        where: { id: item.id },
        data: this.mapRecalculatedItemFields(next, effectiveRate),
      });
    }

    const updated = await tx.procurementOrder.update({
      where: { id: order.id },
      data: {
        ...orderTotals,
        ...this.buildProcurementTransportFields(order, order, transportResolved),
        localTransportKgs: order.localTransportKgs,
        svhToHqTransportCompanyId: order.svhToHqTransportCompanyId,
        totalPaidYuan: summary.totalPaidYuan,
        totalPaidKgs: summary.totalPaidKgs,
        remainingYuan: summary.remainingYuan,
        weightedAverageYuanRate: summary.weightedAverageYuanRate,
        supplierPaymentStatus: summary.supplierPaymentStatus,
      },
      include: this.procurementOrderInclude(),
    });

    if (
      order.hqStockMovementCreatedAt &&
      Number(oldValue.totalCostKgs) !== Number(updated.totalCostKgs)
    ) {
      await tx.procurementCostAdjustment.create({
        data: {
          procurementOrderId: order.id,
          oldTotalCostKgs: Number(oldValue.totalCostKgs),
          newTotalCostKgs: Number(updated.totalCostKgs),
          oldWeightedRate: oldValue.weightedAverageYuanRate
            ? Number(oldValue.weightedAverageYuanRate)
            : null,
          newWeightedRate: summary.weightedAverageYuanRate,
          reason,
          createdById: user.id,
        },
      });
      await this.auditProcurement(tx, user, 'PROCUREMENT_COST_ADJUSTMENT', order.id, {
        oldTotalCostKgs: oldValue.totalCostKgs,
        oldWeightedRate: oldValue.weightedAverageYuanRate,
      }, {
        newTotalCostKgs: updated.totalCostKgs,
        newWeightedRate: summary.weightedAverageYuanRate,
        reason,
      });
    }

    return this.toProcurementOrderResponse(updated);
  }
}
