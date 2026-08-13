-- Service order work line quantity/unit price and draft product stock tracking
ALTER TABLE "Repair" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Repair" ADD COLUMN "unitPrice" DECIMAL(14,2);

ALTER TABLE "PartsConsumption" ADD COLUMN "stockDeducted" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "PartsConsumption_stockDeducted_idx" ON "PartsConsumption"("stockDeducted");
