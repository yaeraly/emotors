import { BranchPriceProfileType, BranchType, PrismaClient } from '@prisma/client';

export type PricingProfileDefinition = {
  profileType: BranchPriceProfileType;
  name: string;
  code: string;
  branchType: BranchType;
  hierarchyOrder: number;
  description: string;
};

export const DEFAULT_PRICING_PROFILE_DEFINITIONS: PricingProfileDefinition[] = [
  {
    profileType: BranchPriceProfileType.HQ_BRANCH,
    name: 'HQ Standard',
    code: 'HQ_STANDARD',
    branchType: BranchType.HQ_BRANCH,
    hierarchyOrder: 0,
    description:
      'HQ internal branch. Always receives products at exact cost price. No automatic discounts.',
  },
  {
    profileType: BranchPriceProfileType.STANDARD_FRANCHISE,
    name: 'Standard Franchise',
    code: 'STANDARD_FRANCHISE',
    branchType: BranchType.FRANCHISE,
    hierarchyOrder: 10,
    description: 'Default profile for every new franchise.',
  },
  {
    profileType: BranchPriceProfileType.BRONZE_FRANCHISE,
    name: 'Bronze Franchise',
    code: 'BRONZE_FRANCHISE',
    branchType: BranchType.FRANCHISE,
    hierarchyOrder: 20,
    description:
      'Entry-level franchise profile with small commercial advantages over Standard Franchise.',
  },
  {
    profileType: BranchPriceProfileType.SILVER_FRANCHISE,
    name: 'Silver Franchise',
    code: 'SILVER_FRANCHISE',
    branchType: BranchType.FRANCHISE,
    hierarchyOrder: 30,
    description: 'Better commercial conditions than Bronze Franchise.',
  },
  {
    profileType: BranchPriceProfileType.GOLD_FRANCHISE,
    name: 'Gold Franchise',
    code: 'GOLD_FRANCHISE',
    branchType: BranchType.FRANCHISE,
    hierarchyOrder: 40,
    description: 'Better commercial conditions than Silver Franchise.',
  },
  {
    profileType: BranchPriceProfileType.PLATINUM_FRANCHISE,
    name: 'Platinum Franchise',
    code: 'PLATINUM_FRANCHISE',
    branchType: BranchType.FRANCHISE,
    hierarchyOrder: 50,
    description: 'Better commercial conditions than Gold Franchise.',
  },
  {
    profileType: BranchPriceProfileType.VIP_FRANCHISE,
    name: 'VIP Franchise',
    code: 'VIP_FRANCHISE',
    branchType: BranchType.FRANCHISE,
    hierarchyOrder: 60,
    description:
      'Highest franchise pricing profile. Reserved for top-performing franchisees.',
  },
  {
    profileType: BranchPriceProfileType.DEALER,
    name: 'Dealer Standard',
    code: 'DEALER_STANDARD',
    branchType: BranchType.DEALER,
    hierarchyOrder: 70,
    description: 'Default pricing profile for dealers.',
  },
  {
    profileType: BranchPriceProfileType.DEALER_PREMIUM,
    name: 'Dealer Premium',
    code: 'DEALER_PREMIUM',
    branchType: BranchType.DEALER,
    hierarchyOrder: 80,
    description:
      'Enhanced pricing profile for dealers with higher purchase volumes or special agreements.',
  },
  {
    profileType: BranchPriceProfileType.DISTRIBUTOR,
    name: 'Distributor Standard',
    code: 'DISTRIBUTOR_STANDARD',
    branchType: BranchType.DISTRIBUTOR,
    hierarchyOrder: 90,
    description: 'Default pricing profile for distributors.',
  },
  {
    profileType: BranchPriceProfileType.DISTRIBUTOR_PREMIUM,
    name: 'Distributor Premium',
    code: 'DISTRIBUTOR_PREMIUM',
    branchType: BranchType.DISTRIBUTOR,
    hierarchyOrder: 100,
    description:
      'Highest pricing profile for distributors with strategic cooperation or high purchase volumes.',
  },
];

export const PRESET_PROFILE_TYPES = DEFAULT_PRICING_PROFILE_DEFINITIONS.map(
  (definition) => definition.profileType,
);

const FRANCHISE_PROFILE_TYPES = new Set<BranchPriceProfileType>(
  DEFAULT_PRICING_PROFILE_DEFINITIONS.filter(
    (definition) => definition.branchType === BranchType.FRANCHISE,
  ).map((definition) => definition.profileType),
);

const DEALER_PROFILE_TYPES = new Set<BranchPriceProfileType>(
  DEFAULT_PRICING_PROFILE_DEFINITIONS.filter(
    (definition) => definition.branchType === BranchType.DEALER,
  ).map((definition) => definition.profileType),
);

const DISTRIBUTOR_PROFILE_TYPES = new Set<BranchPriceProfileType>(
  DEFAULT_PRICING_PROFILE_DEFINITIONS.filter(
    (definition) => definition.branchType === BranchType.DISTRIBUTOR,
  ).map((definition) => definition.profileType),
);

const DEFAULT_PROFILE_TYPE_BY_BRANCH: Record<BranchType, BranchPriceProfileType> = {
  [BranchType.HQ_BRANCH]: BranchPriceProfileType.HQ_BRANCH,
  [BranchType.FRANCHISE]: BranchPriceProfileType.STANDARD_FRANCHISE,
  [BranchType.DEALER]: BranchPriceProfileType.DEALER,
  [BranchType.DISTRIBUTOR]: BranchPriceProfileType.DISTRIBUTOR,
};

const PROFILE_DEFINITION_BY_TYPE = new Map(
  DEFAULT_PRICING_PROFILE_DEFINITIONS.map((definition) => [definition.profileType, definition]),
);

export function getProfileDefinition(profileType: BranchPriceProfileType) {
  return PROFILE_DEFINITION_BY_TYPE.get(profileType) ?? null;
}

export function getProfileCode(profileType: BranchPriceProfileType) {
  return getProfileDefinition(profileType)?.code ?? profileType;
}

export function getBranchTypeForProfileType(profileType: BranchPriceProfileType) {
  return getProfileDefinition(profileType)?.branchType ?? BranchType.FRANCHISE;
}

export function getDefaultProfileTypeForBranchType(branchType: BranchType) {
  return DEFAULT_PROFILE_TYPE_BY_BRANCH[branchType];
}

export function getProfileHierarchyOrder(profileType: BranchPriceProfileType) {
  return getProfileDefinition(profileType)?.hierarchyOrder ?? Number.MAX_SAFE_INTEGER;
}

export function isProfileCompatibleWithBranch(
  branchType: BranchType,
  profileType: BranchPriceProfileType,
) {
  if (branchType === BranchType.HQ_BRANCH) {
    return profileType === BranchPriceProfileType.HQ_BRANCH;
  }
  if (branchType === BranchType.FRANCHISE) {
    return FRANCHISE_PROFILE_TYPES.has(profileType);
  }
  if (branchType === BranchType.DEALER) {
    return DEALER_PROFILE_TYPES.has(profileType);
  }
  if (branchType === BranchType.DISTRIBUTOR) {
    return DISTRIBUTOR_PROFILE_TYPES.has(profileType);
  }
  return false;
}

type PrismaLike = Pick<PrismaClient, 'branchPriceProfile'>;

export async function resolveDefaultPriceProfileId(
  prisma: PrismaLike,
  branchType: BranchType,
) {
  const profileType = getDefaultProfileTypeForBranchType(branchType);
  const profile = await prisma.branchPriceProfile.findUnique({
    where: { profileType },
    select: { id: true },
  });
  return profile?.id ?? null;
}
