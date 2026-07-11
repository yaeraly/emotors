import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPriceFreezePayload } from './pricing-engine.types';
import { PricingEngineService } from './pricing-engine.service';

@Injectable()
export class PricingResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  async resolveBranchProductPrice(
    branchId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const result = await this.pricingEngine.resolvePrice({ productId, branchId });
    return {
      priceKgs: result.resolvedPriceKgs,
      source: result.appliedRuleType,
      baseFranchisePriceKgs: result.baseBranchPriceKgs,
      freeze: toPriceFreezePayload(result),
    };
  }

  async resolveBranchProductUnitPrice(
    branchId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const resolved = await this.resolveBranchProductPrice(branchId, productId, tx);
    return resolved.priceKgs;
  }

  async resolveWithFreeze(branchId: string, productId: string) {
    const result = await this.pricingEngine.resolvePrice({ productId, branchId });
    return toPriceFreezePayload(result);
  }
}
