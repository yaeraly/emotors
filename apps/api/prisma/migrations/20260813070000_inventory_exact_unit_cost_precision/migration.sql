-- High-precision inventory себестоимость.
-- exactUnitCost / FIFO layer money / procurement landed line totals: NUMERIC(30,15)
-- Selling prices, payments, and invoices remain NUMERIC(14,2).

-- FIFO layers: persist original/remaining authoritative totals independently of unit×qty.
ALTER TABLE "FifoInventoryBatch"
  ALTER COLUMN "unitCostKgs" TYPE DECIMAL(30,15),
  ADD COLUMN IF NOT EXISTS "originalLayerCostKgs" DECIMAL(30,15) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "remainingLayerCostKgs" DECIMAL(30,15) NOT NULL DEFAULT 0;

ALTER TABLE "SaleFifoAllocation"
  ALTER COLUMN "unitCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "DistributionFifoAllocation"
  ALTER COLUMN "unitCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "StockMovement"
  ALTER COLUMN "unitCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "InventoryBalance"
  ALTER COLUMN "averageCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "landedCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalValueKgs" TYPE DECIMAL(30,15);

ALTER TABLE "ProcurementOrder"
  ALTER COLUMN "totalCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "ProcurementOrderItem"
  ALTER COLUMN "costKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "chinaDomesticAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "chinaExportAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "localTransportAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "packagingAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "customsAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "insuranceAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "bankFeeAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "otherAllocKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "transportCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "finalCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "ProcurementLandedCostSnapshot"
  ALTER COLUMN "basePurchaseCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedChinaTransportKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedCargoKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedKyrgyzstanTransportKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedInsuranceKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedCustomsKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedTransportExpensesKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedPackagingKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "allocatedOtherExpensesKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalLandedCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "unitLandedCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "BranchPurchaseRequestItem"
  ALTER COLUMN "estimatedUnitCost" TYPE DECIMAL(30,15),
  ALTER COLUMN "estimatedLineProductCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "BranchDistributionOrder"
  ALTER COLUMN "totalCost" TYPE DECIMAL(30,15);

ALTER TABLE "BranchDistributionOrderItem"
  ALTER COLUMN "unitCost" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalCost" TYPE DECIMAL(30,15),
  ALTER COLUMN "landedUnitCostKgs" TYPE DECIMAL(30,15);

ALTER TABLE "GoodsReceivingItem"
  ALTER COLUMN "unitCost" TYPE DECIMAL(30,15);

ALTER TABLE "BranchHqReturn"
  ALTER COLUMN "totalReturnValueKgs" TYPE DECIMAL(30,15);

ALTER TABLE "BranchHqReturnItem"
  ALTER COLUMN "unitCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "lineReturnValueKgs" TYPE DECIMAL(30,15);

ALTER TABLE "BranchHqReturnFifoAllocation"
  ALTER COLUMN "unitCostKgs" TYPE DECIMAL(30,15),
  ALTER COLUMN "totalCostKgs" TYPE DECIMAL(30,15);

-- Backfill FIFO layer money from StockMovement.totalCostKgs (authoritative source).
-- Do not reconstruct from rounded unit × qty when a movement line total exists.
UPDATE "FifoInventoryBatch" AS f
SET
  "originalLayerCostKgs" = m."totalCostKgs",
  "remainingLayerCostKgs" = CASE
    WHEN f."remainingQuantity" <= 0 THEN 0
    WHEN f."initialQuantity" <= 0 THEN 0
    WHEN f."remainingQuantity" >= f."initialQuantity" THEN m."totalCostKgs"
    ELSE ROUND(
      (m."totalCostKgs" * f."remainingQuantity") / f."initialQuantity",
      15
    )
  END
FROM "StockMovement" AS m
WHERE f."stockMovementId" = m.id
  AND m."totalCostKgs" > 0
  AND f."originalLayerCostKgs" = 0;

-- Fallback when no movement total exists: derive original from stored unit × initial qty
-- (historical 2dp unit is the best remaining source; exactUnitCost is then line/qty).
UPDATE "FifoInventoryBatch"
SET
  "originalLayerCostKgs" = ROUND(("unitCostKgs" * "initialQuantity")::numeric, 15),
  "remainingLayerCostKgs" = CASE
    WHEN "remainingQuantity" <= 0 THEN 0
    WHEN "initialQuantity" <= 0 THEN 0
    WHEN "remainingQuantity" >= "initialQuantity" THEN ROUND(("unitCostKgs" * "initialQuantity")::numeric, 15)
    ELSE ROUND(("unitCostKgs" * "remainingQuantity")::numeric, 15)
  END
WHERE "originalLayerCostKgs" = 0
  AND "initialQuantity" > 0
  AND "unitCostKgs" > 0;
