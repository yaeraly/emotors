-- Extend BranchPriceProfileType with missing default profile types.
-- Must run in a separate migration before seeding rows that use these values.
ALTER TYPE "BranchPriceProfileType" ADD VALUE IF NOT EXISTS 'BRONZE_FRANCHISE';
ALTER TYPE "BranchPriceProfileType" ADD VALUE IF NOT EXISTS 'PLATINUM_FRANCHISE';
ALTER TYPE "BranchPriceProfileType" ADD VALUE IF NOT EXISTS 'DEALER_PREMIUM';
ALTER TYPE "BranchPriceProfileType" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR_PREMIUM';
