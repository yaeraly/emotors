export function resolveBookingQuantityDelta(currentBookedQuantity: number, confirmedQuantity: number) {
  const current = Math.max(Number(currentBookedQuantity) || 0, 0);
  const target = Math.max(Number(confirmedQuantity) || 0, 0);

  if (target > current) {
    return { reserveAdditional: target - current, releaseExcess: 0 };
  }
  if (target < current) {
    return { reserveAdditional: 0, releaseExcess: current - target };
  }
  return { reserveAdditional: 0, releaseExcess: 0 };
}
