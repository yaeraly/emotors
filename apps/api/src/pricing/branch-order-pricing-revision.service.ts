import { Injectable } from '@nestjs/common';

/**
 * In-process revision counter for branch-order product search pricing.
 * Bumped when CEO updates franchise branch-sale markups so clients can detect stale reads.
 */
@Injectable()
export class BranchOrderPricingRevisionService {
  private revision = Date.now();

  current(): number {
    return this.revision;
  }

  bump(): number {
    this.revision = Date.now();
    return this.revision;
  }
}
