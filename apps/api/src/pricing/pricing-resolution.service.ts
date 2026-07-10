import { Injectable } from '@nestjs/common';
import { BranchType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveFinalBranchProductPrice } from './pricing-calculator.util';
import { PricingFifoService } from './pricing-fifo.service';

@Injectable()
export class PricingResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
  ) {}

  async resolveBranchProductPrice(
    branchId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const branch = await client.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      include: {
        priceProfile: {
          include: {
            categoryDiscounts: true,
          },
        },
      },
    });
    const product = await client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true,
        categoryId: true,
        hqBranchWholesaleMarkupPercent: true,
      },
    });
    if (!branch || !product) {
      return { priceKgs: 0, source: 'HQ_COST' as const, baseFranchisePriceKgs: 0 };
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id, tx);
    const categoryDiscount = branch.priceProfile?.categoryDiscounts.find(
      (row) => row.categoryId === product.categoryId,
    );
    const override = await client.productPriceOverride.findFirst({
      where: {
        branchId,
        productId,
        status: 'ACTIVE',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return resolveFinalBranchProductPrice({
      costPriceKgs: cost.costPriceKgs,
      branchType: branch.branchType,
      baseFranchiseMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      categoryDiscountPercent: categoryDiscount ? Number(categoryDiscount.discountPercent) : 0,
      overridePriceKgs: override ? Number(override.overridePriceKgs) : null,
      override: override ?? null,
    });
  }

  async resolveBranchProductUnitPrice(
    branchId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const resolved = await this.resolveBranchProductPrice(branchId, productId, tx);
    return resolved.priceKgs;
  }
}
