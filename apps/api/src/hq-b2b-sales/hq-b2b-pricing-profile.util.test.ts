import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchType, BranchPriceProfileType } from '@prisma/client';
import {
  getDefaultProfileTypeForBranchType,
} from '../pricing/pricing-profile-defaults.util';

describe('Dealer and Distributor pricing profiles', () => {
  it('Dealer sale uses Dealer price profile type', () => {
    assert.equal(
      getDefaultProfileTypeForBranchType(BranchType.DEALER),
      BranchPriceProfileType.DEALER,
    );
  });

  it('Distributor sale uses Distributor price profile type', () => {
    assert.equal(
      getDefaultProfileTypeForBranchType(BranchType.DISTRIBUTOR),
      BranchPriceProfileType.DISTRIBUTOR,
    );
  });

  it('Dealer and Distributor profiles differ', () => {
    const dealer = getDefaultProfileTypeForBranchType(BranchType.DEALER);
    const distributor = getDefaultProfileTypeForBranchType(BranchType.DISTRIBUTOR);
    assert.notEqual(dealer, distributor);
  });
});
