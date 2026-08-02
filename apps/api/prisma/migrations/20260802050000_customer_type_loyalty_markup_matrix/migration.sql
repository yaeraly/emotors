-- Per customer-type × loyalty-category markup matrix for HQ defaults and Branch Pricing Policy.

ALTER TABLE "LoyaltyProgramSettings"
  ADD COLUMN IF NOT EXISTS "retailStandardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "retailSilverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "retailGoldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "retailVipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "masterStandardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "masterSilverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "masterGoldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "masterVipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "wholesaleStandardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "wholesaleSilverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "wholesaleGoldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "wholesaleVipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

UPDATE "LoyaltyProgramSettings"
SET
  "retailStandardMarkupPercent" = COALESCE("retailStandardMarkupPercent", "standardMarkupPercent", 5),
  "retailSilverMarkupPercent" = COALESCE("retailSilverMarkupPercent", "silverMarkupPercent", 3),
  "retailGoldMarkupPercent" = COALESCE("retailGoldMarkupPercent", "goldMarkupPercent", 1.5),
  "retailVipMarkupPercent" = COALESCE("retailVipMarkupPercent", "vipMarkupPercent", 0),
  "masterStandardMarkupPercent" = COALESCE("masterStandardMarkupPercent", 6),
  "masterSilverMarkupPercent" = COALESCE("masterSilverMarkupPercent", 4),
  "masterGoldMarkupPercent" = COALESCE("masterGoldMarkupPercent", 2),
  "masterVipMarkupPercent" = COALESCE("masterVipMarkupPercent", 1),
  "wholesaleStandardMarkupPercent" = COALESCE("wholesaleStandardMarkupPercent", "standardMarkupPercent", 5),
  "wholesaleSilverMarkupPercent" = COALESCE("wholesaleSilverMarkupPercent", "silverMarkupPercent", 3),
  "wholesaleGoldMarkupPercent" = COALESCE("wholesaleGoldMarkupPercent", "goldMarkupPercent", 1.5),
  "wholesaleVipMarkupPercent" = COALESCE("wholesaleVipMarkupPercent", "vipMarkupPercent", 0)
WHERE "singletonKey" = 'DEFAULT';

ALTER TABLE "BranchPricingPolicy"
  ADD COLUMN IF NOT EXISTS "retailStandardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "retailSilverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "retailGoldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "retailVipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "masterStandardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "masterSilverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "masterGoldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "masterVipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "wholesaleStandardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "wholesaleSilverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "wholesaleGoldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "wholesaleVipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

UPDATE "BranchPricingPolicy"
SET
  "retailStandardMarkupPercent" = COALESCE("retailStandardMarkupPercent", "standardMarkupPercent", 5),
  "retailSilverMarkupPercent" = COALESCE("retailSilverMarkupPercent", "silverMarkupPercent", 3),
  "retailGoldMarkupPercent" = COALESCE("retailGoldMarkupPercent", "goldMarkupPercent", 1.5),
  "retailVipMarkupPercent" = COALESCE("retailVipMarkupPercent", "vipMarkupPercent", 0),
  "masterStandardMarkupPercent" = COALESCE("masterStandardMarkupPercent", 6),
  "masterSilverMarkupPercent" = COALESCE("masterSilverMarkupPercent", 4),
  "masterGoldMarkupPercent" = COALESCE("masterGoldMarkupPercent", 2),
  "masterVipMarkupPercent" = COALESCE("masterVipMarkupPercent", 1),
  "wholesaleStandardMarkupPercent" = COALESCE("wholesaleStandardMarkupPercent", "standardMarkupPercent", 5),
  "wholesaleSilverMarkupPercent" = COALESCE("wholesaleSilverMarkupPercent", "silverMarkupPercent", 3),
  "wholesaleGoldMarkupPercent" = COALESCE("wholesaleGoldMarkupPercent", "goldMarkupPercent", 1.5),
  "wholesaleVipMarkupPercent" = COALESCE("wholesaleVipMarkupPercent", "vipMarkupPercent", 0);
