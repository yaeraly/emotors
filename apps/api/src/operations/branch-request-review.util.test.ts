import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import { resolveLineReview } from './branch-request-review.util';

describe('resolveLineReview booking availability', () => {
  it('allows full approval when general stock is zero but line is booked', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'APPROVE' },
      {
        requestedQuantity: 6,
        availableQuantity: 0,
        bookedQuantity: 6,
        hasPricingPolicy: true,
      },
    );

    expect(result.lineStatus).toBe(BranchPurchaseRequestLineStatus.APPROVED);
    expect(result.approvedQuantity).toBe(6);
  });

  it('rejects approval above booked plus general availability', () => {
    expect(() =>
      resolveLineReview(
        { id: 'line-1', action: 'PARTIAL', approvedQuantity: 8 },
        {
          requestedQuantity: 10,
          availableQuantity: 0,
          bookedQuantity: 6,
          hasPricingPolicy: true,
        },
      ),
    ).toThrow('APPROVED_QUANTITY_EXCEEDS_AVAILABLE');
  });
});
