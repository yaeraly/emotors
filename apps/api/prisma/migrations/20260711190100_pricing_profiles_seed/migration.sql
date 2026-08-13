-- Normalize existing default profile names, codes, and branch types
UPDATE "BranchPriceProfile"
SET
  "name" = 'HQ Standard',
  "code" = 'HQ_STANDARD',
  "branchType" = 'HQ_BRANCH',
  "description" = 'HQ internal branch. Always receives products at exact cost price. No automatic discounts.'
WHERE "profileType" = 'HQ_BRANCH';

UPDATE "BranchPriceProfile"
SET
  "name" = 'Standard Franchise',
  "code" = 'STANDARD_FRANCHISE',
  "branchType" = 'FRANCHISE',
  "description" = 'Default profile for every new franchise.'
WHERE "profileType" = 'STANDARD_FRANCHISE';

UPDATE "BranchPriceProfile"
SET
  "name" = 'Silver Franchise',
  "code" = 'SILVER_FRANCHISE',
  "branchType" = 'FRANCHISE',
  "description" = 'Better commercial conditions than Bronze Franchise.'
WHERE "profileType" = 'SILVER_FRANCHISE';

UPDATE "BranchPriceProfile"
SET
  "name" = 'Gold Franchise',
  "code" = 'GOLD_FRANCHISE',
  "branchType" = 'FRANCHISE',
  "description" = 'Better commercial conditions than Silver Franchise.'
WHERE "profileType" = 'GOLD_FRANCHISE';

UPDATE "BranchPriceProfile"
SET
  "name" = 'VIP Franchise',
  "code" = 'VIP_FRANCHISE',
  "branchType" = 'FRANCHISE',
  "description" = 'Highest franchise pricing profile. Reserved for top-performing franchisees.'
WHERE "profileType" = 'VIP_FRANCHISE';

UPDATE "BranchPriceProfile"
SET
  "name" = 'Dealer Standard',
  "code" = 'DEALER_STANDARD',
  "branchType" = 'DEALER',
  "description" = 'Default pricing profile for dealers.'
WHERE "profileType" = 'DEALER';

UPDATE "BranchPriceProfile"
SET
  "name" = 'Distributor Standard',
  "code" = 'DISTRIBUTOR_STANDARD',
  "branchType" = 'DISTRIBUTOR',
  "description" = 'Default pricing profile for distributors.'
WHERE "profileType" = 'DISTRIBUTOR';

-- Seed missing default profiles
INSERT INTO "BranchPriceProfile" (
  "id", "name", "code", "profileType", "branchType", "defaultHqMarkupPercent", "status", "description", "createdAt", "updatedAt"
)
SELECT
  'bpp_bronze_franchise',
  'Bronze Franchise',
  'BRONZE_FRANCHISE',
  'BRONZE_FRANCHISE',
  'FRANCHISE',
  0,
  'ACTIVE',
  'Entry-level franchise profile with small commercial advantages over Standard Franchise.',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'BRONZE_FRANCHISE');

INSERT INTO "BranchPriceProfile" (
  "id", "name", "code", "profileType", "branchType", "defaultHqMarkupPercent", "status", "description", "createdAt", "updatedAt"
)
SELECT
  'bpp_platinum_franchise',
  'Platinum Franchise',
  'PLATINUM_FRANCHISE',
  'PLATINUM_FRANCHISE',
  'FRANCHISE',
  0,
  'ACTIVE',
  'Better commercial conditions than Gold Franchise.',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'PLATINUM_FRANCHISE');

INSERT INTO "BranchPriceProfile" (
  "id", "name", "code", "profileType", "branchType", "defaultHqMarkupPercent", "status", "description", "createdAt", "updatedAt"
)
SELECT
  'bpp_dealer_premium',
  'Dealer Premium',
  'DEALER_PREMIUM',
  'DEALER_PREMIUM',
  'DEALER',
  0,
  'ACTIVE',
  'Enhanced pricing profile for dealers with higher purchase volumes or special agreements.',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'DEALER_PREMIUM');

INSERT INTO "BranchPriceProfile" (
  "id", "name", "code", "profileType", "branchType", "defaultHqMarkupPercent", "status", "description", "createdAt", "updatedAt"
)
SELECT
  'bpp_distributor_premium',
  'Distributor Premium',
  'DISTRIBUTOR_PREMIUM',
  'DISTRIBUTOR_PREMIUM',
  'DISTRIBUTOR',
  0,
  'ACTIVE',
  'Highest pricing profile for distributors with strategic cooperation or high purchase volumes.',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'DISTRIBUTOR_PREMIUM');
