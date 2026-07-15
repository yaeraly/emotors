import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HqStockBookingReleaseReason,
  HqStockBookingStatus,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  addBookingHours,
  BRANCH_CONFIRMATION_BOOKING_HOURS,
  HQ_SALES_REVIEW_BOOKING_HOURS,
  PAYMENT_BOOKING_HOURS,
  POST_PAYMENT_BOOKING_HOURS,
} from './hq-stock-booking.constants';
import { InventoryService } from './inventory.service';

type PrismaTx = Prisma.TransactionClient;

const ACTIVE_BOOKING_STATUSES: HqStockBookingStatus[] = [
  HqStockBookingStatus.ACTIVE,
  HqStockBookingStatus.CONFIRMED,
];

export type BookingLineInput = {
  requestLineId: string;
  productId: string;
  sku: string;
  requestedQuantity: number;
};

export type BookingLineResult = {
  requestLineId: string;
  bookedQuantity: number;
  hqPhysicalStock: number;
  hqAvailableStock: number;
  bookingId: string | null;
  expiresAt: Date | null;
};

@Injectable()
export class HqStockBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  availableForRequestLine(generalAvailable: number, bookedForLine: number) {
    return Math.max(generalAvailable, 0) + Math.max(bookedForLine, 0);
  }

  async getActiveBookedQuantityByLine(requestId: string) {
    const bookings = await this.prisma.hqStockBooking.findMany({
      where: {
        requestId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: { requestLineId: true, bookedQuantity: true, confirmedQuantity: true, status: true },
    });
    const map = new Map<string, number>();
    for (const booking of bookings) {
      const qty =
        booking.status === HqStockBookingStatus.CONFIRMED
          ? booking.confirmedQuantity ?? booking.bookedQuantity
          : booking.bookedQuantity;
      map.set(booking.requestLineId, qty);
    }
    return map;
  }

  async createBookingsForRequestSubmit(
    tx: PrismaTx,
    user: AuthUser,
    params: {
      requestId: string;
      branchId: string;
      warehouseId: string;
      lines: BookingLineInput[];
    },
  ): Promise<BookingLineResult[]> {
    const expiresAt = addBookingHours(new Date(), HQ_SALES_REVIEW_BOOKING_HOURS);
    const results: BookingLineResult[] = [];

    for (const line of params.lines) {
      const result = await this.createBookingForLineInTx(tx, user, {
        ...params,
        ...line,
        expiresAt,
      });
      results.push(result);
    }

    return results;
  }

  private async lockInventoryBalance(
    tx: PrismaTx,
    branchId: string,
    warehouseId: string,
    productId: string,
  ) {
    const rows = await tx.$queryRaw<
      Array<{ quantity: number; reservedQuantity: number }>
    >`
      SELECT "quantity", "reservedQuantity"
      FROM "InventoryBalance"
      WHERE "branchId" = ${branchId}
        AND "warehouseId" = ${warehouseId}
        AND "productId" = ${productId}
      FOR UPDATE
    `;
    return rows[0] ?? { quantity: 0, reservedQuantity: 0 };
  }

  private async createBookingForLineInTx(
    tx: PrismaTx,
    user: AuthUser,
    params: {
      requestId: string;
      branchId: string;
      warehouseId: string;
      requestLineId: string;
      productId: string;
      sku: string;
      requestedQuantity: number;
      expiresAt: Date;
    },
  ): Promise<BookingLineResult> {
    const inventoryProduct = await this.inventoryService.resolveWarehouseInventoryProductInTx(
      tx,
      params.warehouseId,
      params.productId,
      params.sku,
    );

    const locked = await this.lockInventoryBalance(
      tx,
      inventoryProduct.branchId,
      params.warehouseId,
      inventoryProduct.productId,
    );
    const physicalQuantity = locked.quantity ?? 0;
    const reservedQuantity = locked.reservedQuantity ?? 0;
    const availableQuantity = Math.max(physicalQuantity - reservedQuantity, 0);
    const bookedQuantity = Math.min(Math.max(params.requestedQuantity, 0), availableQuantity);

    let bookingId: string | null = null;
    if (bookedQuantity > 0) {
      const existingBalance = await tx.inventoryBalance.findUnique({
        where: {
          branchId_warehouseId_productId: {
            branchId: inventoryProduct.branchId,
            warehouseId: params.warehouseId,
            productId: inventoryProduct.productId,
          },
        },
      });

      if (existingBalance) {
        await tx.inventoryBalance.update({
          where: {
            branchId_warehouseId_productId: {
              branchId: inventoryProduct.branchId,
              warehouseId: params.warehouseId,
              productId: inventoryProduct.productId,
            },
          },
          data: { reservedQuantity: { increment: bookedQuantity } },
        });
      } else {
        await tx.inventoryBalance.create({
          data: {
            branchId: inventoryProduct.branchId,
            warehouseId: params.warehouseId,
            productId: inventoryProduct.productId,
            quantity: 0,
            reservedQuantity: bookedQuantity,
          },
        });
      }

      const updated = await this.lockInventoryBalance(
        tx,
        inventoryProduct.branchId,
        params.warehouseId,
        inventoryProduct.productId,
      );
      if ((updated.reservedQuantity ?? 0) > (updated.quantity ?? 0)) {
        throw new BadRequestException(
          'Количество товара изменилось. Обновите заявку и повторите проверку.',
        );
      }

      const booking = await tx.hqStockBooking.create({
        data: {
          warehouseId: params.warehouseId,
          productId: inventoryProduct.productId,
          branchId: params.branchId,
          requestId: params.requestId,
          requestLineId: params.requestLineId,
          bookedQuantity,
          status: HqStockBookingStatus.ACTIVE,
          expiresAt: params.expiresAt,
          createdById: user.id,
        },
      });
      bookingId = booking.id;
    }

    await tx.branchPurchaseRequestItem.update({
      where: { id: params.requestLineId },
      data: {
        bookedQuantity,
        hqPhysicalStock: physicalQuantity,
        hqAvailableStock: availableQuantity,
        bookingExpiresAt: bookedQuantity > 0 ? params.expiresAt : null,
      },
    });

    return {
      requestLineId: params.requestLineId,
      bookedQuantity,
      hqPhysicalStock: physicalQuantity,
      hqAvailableStock: availableQuantity,
      bookingId,
      expiresAt: bookedQuantity > 0 ? params.expiresAt : null,
    };
  }

  async confirmBookingInTx(
    tx: PrismaTx,
    user: AuthUser,
    bookingId: string,
    confirmedQuantity: number,
    expiresAt: Date,
  ) {
    const booking = await tx.hqStockBooking.findUnique({ where: { id: bookingId } });
    if (!booking) return null;
    if (
      booking.status !== HqStockBookingStatus.ACTIVE &&
      booking.status !== HqStockBookingStatus.CONFIRMED
    ) {
      throw new BadRequestException('Бронь товара истекла. Требуется повторная проверка остатков.');
    }
    if (confirmedQuantity > booking.bookedQuantity) {
      throw new BadRequestException(
        'На складе HQ недостаточно товара для утверждения указанного количества.',
      );
    }

    const excess = booking.bookedQuantity - confirmedQuantity;
    if (excess > 0) {
      await this.releaseQuantityInTx(tx, user, booking, excess, HqStockBookingReleaseReason.PARTIAL_APPROVAL_EXCESS);
    }

    const updated = await tx.hqStockBooking.update({
      where: { id: booking.id },
      data: {
        status: HqStockBookingStatus.CONFIRMED,
        confirmedQuantity,
        confirmedAt: new Date(),
        confirmedById: user.id,
        expiresAt,
        bookedQuantity: confirmedQuantity,
      },
    });

    await tx.branchPurchaseRequestItem.update({
      where: { id: booking.requestLineId },
      data: {
        bookedQuantity: confirmedQuantity,
        bookingExpiresAt: expiresAt,
      },
    });

    return updated;
  }

  async releaseBookingInTx(
    tx: PrismaTx,
    user: AuthUser,
    bookingId: string,
    reason: HqStockBookingReleaseReason,
  ) {
    const booking = await tx.hqStockBooking.findUnique({ where: { id: bookingId } });
    if (!booking) return null;
    if (
      booking.status === HqStockBookingStatus.RELEASED ||
      booking.status === HqStockBookingStatus.EXPIRED ||
      booking.status === HqStockBookingStatus.CONSUMED
    ) {
      return booking;
    }
    return this.releaseQuantityInTx(tx, user, booking, booking.bookedQuantity, reason, true);
  }

  async releaseAllForRequestInTx(
    tx: PrismaTx,
    user: AuthUser,
    requestId: string,
    reason: HqStockBookingReleaseReason,
  ) {
    const bookings = await tx.hqStockBooking.findMany({
      where: {
        requestId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    });
    for (const booking of bookings) {
      await this.releaseQuantityInTx(tx, user, booking, booking.bookedQuantity, reason, true);
    }
  }

  private async releaseQuantityInTx(
    tx: PrismaTx,
    user: AuthUser,
    booking: {
      id: string;
      warehouseId: string;
      productId: string;
      requestLineId: string;
      bookedQuantity: number;
      status: HqStockBookingStatus;
    },
    releaseQuantity: number,
    reason: HqStockBookingReleaseReason,
    finalize = false,
  ) {
    const qty = Math.min(Math.max(releaseQuantity, 0), booking.bookedQuantity);
    if (qty <= 0) return booking;

    const inventoryProduct = await this.inventoryService.resolveWarehouseInventoryProductInTx(
      tx,
      booking.warehouseId,
      booking.productId,
    );

    await this.lockInventoryBalance(
      tx,
      inventoryProduct.branchId,
      booking.warehouseId,
      inventoryProduct.productId,
    );

    await tx.inventoryBalance.updateMany({
      where: {
        branchId: inventoryProduct.branchId,
        warehouseId: booking.warehouseId,
        productId: inventoryProduct.productId,
        reservedQuantity: { gte: qty },
      },
      data: { reservedQuantity: { decrement: qty } },
    });

    const remaining = booking.bookedQuantity - qty;
    const updated = await tx.hqStockBooking.update({
      where: { id: booking.id },
      data: finalize || remaining <= 0
        ? {
            status:
              reason === HqStockBookingReleaseReason.EXPIRED
                ? HqStockBookingStatus.EXPIRED
                : HqStockBookingStatus.RELEASED,
            bookedQuantity: remaining > 0 ? remaining : 0,
            releasedAt: new Date(),
            releasedById: user.id,
            releaseReason: reason,
          }
        : {
            bookedQuantity: remaining,
          },
    });

    if (finalize || remaining <= 0) {
      await tx.branchPurchaseRequestItem.update({
        where: { id: booking.requestLineId },
        data: { bookedQuantity: 0, bookingExpiresAt: null },
      });
    } else {
      await tx.branchPurchaseRequestItem.update({
        where: { id: booking.requestLineId },
        data: { bookedQuantity: remaining },
      });
    }

    return updated;
  }

  extendBookingsForBranchConfirmation(requestId: string, tx: PrismaTx) {
    const expiresAt = addBookingHours(new Date(), BRANCH_CONFIRMATION_BOOKING_HOURS);
    return this.extendActiveBookings(tx, requestId, expiresAt);
  }

  extendBookingsForPayment(requestId: string, tx: PrismaTx) {
    const expiresAt = addBookingHours(new Date(), PAYMENT_BOOKING_HOURS);
    return this.extendActiveBookings(tx, requestId, expiresAt);
  }

  extendBookingsAfterPayment(requestId: string, tx: PrismaTx) {
    const expiresAt = addBookingHours(new Date(), POST_PAYMENT_BOOKING_HOURS);
    return this.extendActiveBookings(tx, requestId, expiresAt);
  }

  private async extendActiveBookings(tx: PrismaTx, requestId: string, expiresAt: Date) {
    await tx.hqStockBooking.updateMany({
      where: {
        requestId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      data: { expiresAt },
    });
    await tx.branchPurchaseRequest.update({
      where: { id: requestId },
      data: { bookingExpiresAt: expiresAt },
    });
    await tx.branchPurchaseRequestItem.updateMany({
      where: { requestId },
      data: { bookingExpiresAt: expiresAt },
    });
  }

  async linkBookingsToDistributionOrder(
    tx: PrismaTx,
    requestId: string,
    distributionOrderId: string,
  ) {
    await tx.hqStockBooking.updateMany({
      where: {
        requestId,
        status: HqStockBookingStatus.CONFIRMED,
      },
      data: { distributionOrderId },
    });
  }

  async consumeBookingsForDispatch(
    tx: PrismaTx,
    user: AuthUser,
    distributionOrderId: string,
    items: Array<{ productId: string; sku: string; quantity: number }>,
  ) {
    const bookings = await tx.hqStockBooking.findMany({
      where: {
        distributionOrderId,
        status: HqStockBookingStatus.CONFIRMED,
      },
    });
    if (!bookings.length) return;

    const bookingByProduct = new Map(bookings.map((b) => [b.productId, b]));
    for (const item of items) {
      const inventoryProduct = await this.inventoryService.resolveWarehouseInventoryProductInTx(
        tx,
        bookings[0].warehouseId,
        item.productId,
        item.sku,
      );
      const booking = bookingByProduct.get(inventoryProduct.productId);
      if (!booking) continue;

      const consumeQty = Math.min(item.quantity, booking.confirmedQuantity ?? booking.bookedQuantity);
      await tx.hqStockBooking.update({
        where: { id: booking.id },
        data: {
          status: HqStockBookingStatus.CONSUMED,
          consumedQuantity: consumeQty,
          consumedAt: new Date(),
        },
      });
    }
  }

  hasActiveBookingsForDistributionOrder(distributionOrderId: string) {
    return this.prisma.hqStockBooking.count({
      where: {
        distributionOrderId,
        status: HqStockBookingStatus.CONFIRMED,
      },
    });
  }

  async expireOverdueBookingsInTx(tx: PrismaTx, user: AuthUser) {
    const now = new Date();
    const expired = await tx.hqStockBooking.findMany({
      where: {
        status: { in: ACTIVE_BOOKING_STATUSES },
        expiresAt: { lte: now },
      },
    });
    for (const booking of expired) {
      await this.releaseQuantityInTx(
        tx,
        user,
        booking,
        booking.bookedQuantity,
        HqStockBookingReleaseReason.EXPIRED,
        true,
      );
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'HQ_STOCK_BOOKING_EXPIRED',
          entity: 'HqStockBooking',
          entityId: booking.id,
          metadata: {
            requestId: booking.requestId,
            requestLineId: booking.requestLineId,
            productId: booking.productId,
            bookedQuantity: booking.bookedQuantity,
            roles: user.roles ?? [user.role],
          },
        },
      });
    }
    return expired.length;
  }

  async expireOverdueBookings(user: AuthUser) {
    return this.prisma.$transaction(async (tx) => this.expireOverdueBookingsInTx(tx, user));
  }
}
