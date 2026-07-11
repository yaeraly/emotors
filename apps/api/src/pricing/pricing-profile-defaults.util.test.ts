import { BranchPriceProfileType, BranchType } from '@prisma/client';
import {
  getDefaultProfileTypeForBranchType,
  getProfileCode,
  getProfileHierarchyOrder,
  isProfileCompatibleWithBranch,
  PRESET_PROFILE_TYPES,
} from './pricing-profile-defaults.util';

describe('pricing-profile-defaults.util', () => {
  it('defines all eleven preset profile types', () => {
    expect(PRESET_PROFILE_TYPES).toHaveLength(11);
    expect(PRESET_PROFILE_TYPES).toEqual(
      expect.arrayContaining([
        BranchPriceProfileType.HQ_BRANCH,
        BranchPriceProfileType.STANDARD_FRANCHISE,
        BranchPriceProfileType.BRONZE_FRANCHISE,
        BranchPriceProfileType.SILVER_FRANCHISE,
        BranchPriceProfileType.GOLD_FRANCHISE,
        BranchPriceProfileType.PLATINUM_FRANCHISE,
        BranchPriceProfileType.VIP_FRANCHISE,
        BranchPriceProfileType.DEALER,
        BranchPriceProfileType.DEALER_PREMIUM,
        BranchPriceProfileType.DISTRIBUTOR,
        BranchPriceProfileType.DISTRIBUTOR_PREMIUM,
      ]),
    );
  });

  it('maps branch types to default profile types', () => {
    expect(getDefaultProfileTypeForBranchType(BranchType.HQ_BRANCH)).toBe(
      BranchPriceProfileType.HQ_BRANCH,
    );
    expect(getDefaultProfileTypeForBranchType(BranchType.FRANCHISE)).toBe(
      BranchPriceProfileType.STANDARD_FRANCHISE,
    );
    expect(getDefaultProfileTypeForBranchType(BranchType.DEALER)).toBe(
      BranchPriceProfileType.DEALER,
    );
    expect(getDefaultProfileTypeForBranchType(BranchType.DISTRIBUTOR)).toBe(
      BranchPriceProfileType.DISTRIBUTOR,
    );
  });

  it('keeps franchise, dealer, and distributor hierarchies independent', () => {
    expect(
      isProfileCompatibleWithBranch(BranchType.FRANCHISE, BranchPriceProfileType.SILVER_FRANCHISE),
    ).toBe(true);
    expect(
      isProfileCompatibleWithBranch(BranchType.FRANCHISE, BranchPriceProfileType.DEALER),
    ).toBe(false);
    expect(
      isProfileCompatibleWithBranch(BranchType.DEALER, BranchPriceProfileType.DEALER_PREMIUM),
    ).toBe(true);
    expect(
      isProfileCompatibleWithBranch(BranchType.DEALER, BranchPriceProfileType.VIP_FRANCHISE),
    ).toBe(false);
    expect(
      isProfileCompatibleWithBranch(
        BranchType.DISTRIBUTOR,
        BranchPriceProfileType.DISTRIBUTOR_PREMIUM,
      ),
    ).toBe(true);
    expect(
      isProfileCompatibleWithBranch(BranchType.HQ_BRANCH, BranchPriceProfileType.HQ_BRANCH),
    ).toBe(true);
    expect(
      isProfileCompatibleWithBranch(BranchType.HQ_BRANCH, BranchPriceProfileType.STANDARD_FRANCHISE),
    ).toBe(false);
  });

  it('orders franchise profiles before dealer and distributor profiles', () => {
    expect(getProfileHierarchyOrder(BranchPriceProfileType.VIP_FRANCHISE)).toBeLessThan(
      getProfileHierarchyOrder(BranchPriceProfileType.DEALER),
    );
    expect(getProfileHierarchyOrder(BranchPriceProfileType.DEALER_PREMIUM)).toBeLessThan(
      getProfileHierarchyOrder(BranchPriceProfileType.DISTRIBUTOR),
    );
  });

  it('uses stable profile codes', () => {
    expect(getProfileCode(BranchPriceProfileType.HQ_BRANCH)).toBe('HQ_STANDARD');
    expect(getProfileCode(BranchPriceProfileType.DEALER)).toBe('DEALER_STANDARD');
    expect(getProfileCode(BranchPriceProfileType.DISTRIBUTOR_PREMIUM)).toBe('DISTRIBUTOR_PREMIUM');
  });
});
