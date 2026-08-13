ALTER TABLE "ProcurementOrder"
ADD COLUMN "chinaDomesticTransportUnlockedAt" TIMESTAMP(3),
ADD COLUMN "chinaDomesticTransportUnlockExpiresAt" TIMESTAMP(3),
ADD COLUMN "chinaDomesticTransportUnlockReason" TEXT,
ADD COLUMN "chinaDomesticTransportUnlockedById" TEXT;

ALTER TABLE "ProcurementOrder"
ADD CONSTRAINT "ProcurementOrder_chinaDomesticTransportUnlockedById_fkey"
FOREIGN KEY ("chinaDomesticTransportUnlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
