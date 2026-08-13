import {
  normalizeReceivingLine,
  resolveReceivingDifferenceQuantity,
  resolveShipmentItemId,
} from './branch-receiving.util';

describe('branch receiving utils', () => {
  it('resolves shipment item id from shipmentItemId', () => {
    expect(resolveShipmentItemId({ shipmentItemId: 'line-1' })).toBe('line-1');
  });

  it('resolves shipment item id from distributionOrderItemId fallback', () => {
    expect(resolveShipmentItemId({ distributionOrderItemId: 'line-2' })).toBe('line-2');
  });

  it('normalizes accepted quantity without adding damaged or missing stock', () => {
    const line = normalizeReceivingLine(
      {
        shipmentItemId: 'line-1',
        acceptedQuantity: 8,
        damagedQuantity: 1,
        missingQuantity: 1,
      },
      10,
    );

    expect(line).toEqual({
      shipmentItemId: 'line-1',
      acceptedQuantity: 8,
      damagedQuantity: 1,
      missingQuantity: 1,
      discrepancyReason: undefined,
      note: undefined,
    });
  });

  it('derives accepted quantity from legacy receivedQuantity minus damaged', () => {
    const line = normalizeReceivingLine(
      {
        distributionOrderItemId: 'line-1',
        receivedQuantity: 9,
        damagedQuantity: 2,
      },
      10,
    );

    expect(line.acceptedQuantity).toBe(7);
    expect(line.missingQuantity).toBe(1);
  });

  it('computes receiving difference from accepted, damaged, and missing quantities', () => {
    expect(resolveReceivingDifferenceQuantity(10, 8, 1, 1)).toBe(0);
    expect(resolveReceivingDifferenceQuantity(10, 7, 0, 0)).toBe(-3);
  });
});
