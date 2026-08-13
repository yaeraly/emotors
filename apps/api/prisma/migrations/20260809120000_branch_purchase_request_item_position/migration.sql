-- Preserve branch purchase request line order as submitted by Branch Sales Manager.
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "BranchPurchaseRequestItem" AS item
SET "position" = ranked.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "requestId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "BranchPurchaseRequestItem"
) AS ranked
WHERE item.id = ranked.id;

CREATE INDEX "BranchPurchaseRequestItem_requestId_position_idx"
  ON "BranchPurchaseRequestItem"("requestId", "position");
