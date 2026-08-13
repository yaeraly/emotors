-- Pricing Policy master settings (singleton)
-- Must run before any later fix_project migrations that reference this model.

CREATE TABLE IF NOT EXISTS "PricingMasterSettings" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'DEFAULT',
    "baseCalculationSource" TEXT NOT NULL DEFAULT 'FIFO_COST',
    "roundingStrategy" TEXT NOT NULL DEFAULT 'ROUNDUP',
    "roundUpPrecision" INTEGER NOT NULL DEFAULT -1,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "defaultDecimalPrecision" INTEGER NOT NULL DEFAULT 2,
    "defaultMinimumMarkup" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "defaultMaximumMarkup" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "defaultActivationTimezone" TEXT NOT NULL DEFAULT 'Asia/Bishkek',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingMasterSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PricingMasterSettings_singletonKey_key"
  ON "PricingMasterSettings"("singletonKey");

CREATE INDEX IF NOT EXISTS "PricingMasterSettings_updatedById_idx"
  ON "PricingMasterSettings"("updatedById");

DO $$ BEGIN
  ALTER TABLE "PricingMasterSettings"
    ADD CONSTRAINT "PricingMasterSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "PricingMasterSettings" (
  "id",
  "singletonKey",
  "baseCalculationSource",
  "roundingStrategy",
  "roundUpPrecision",
  "currency",
  "defaultDecimalPrecision",
  "defaultMinimumMarkup",
  "defaultMaximumMarkup",
  "defaultActivationTimezone",
  "createdAt",
  "updatedAt"
)
SELECT
  'pricing_master_settings_default',
  'DEFAULT',
  'FIFO_COST',
  'ROUNDUP',
  -1,
  'KGS',
  2,
  0,
  0,
  'Asia/Bishkek',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "PricingMasterSettings" WHERE "singletonKey" = 'DEFAULT'
);
