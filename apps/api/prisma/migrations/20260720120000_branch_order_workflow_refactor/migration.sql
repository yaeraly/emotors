-- Branch invoice cashier handoff for accountant → cashier workflow
ALTER TABLE "BranchInvoice" ADD COLUMN IF NOT EXISTS "sentToCashierAt" TIMESTAMP(3);
