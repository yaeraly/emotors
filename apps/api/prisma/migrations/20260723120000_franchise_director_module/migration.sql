-- AlterEnum AlertType
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_APPLICATION_NEW';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_KPI_BELOW_TARGET';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_BRANCH_INACTIVE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_REPORT_MISSING';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_TASK_OVERDUE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_CERTIFICATE_EXPIRED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'FRANCHISE_CRITICAL_SHORTAGE';

-- AlterEnum NotificationModule
ALTER TYPE "NotificationModule" ADD VALUE IF NOT EXISTS 'FRANCHISE';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FranchiseExpansionStatus" AS ENUM ('LEAD', 'NEGOTIATION', 'AGREEMENT', 'PREPARING', 'OPENING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FranchiseSupportTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FranchiseExpansionLead" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "status" "FranchiseExpansionStatus" NOT NULL DEFAULT 'LEAD',
    "agreementStatus" TEXT,
    "documentsNote" TEXT,
    "plannedOpeningDate" TIMESTAMP(3),
    "responsibleManagerId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FranchiseExpansionLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FranchiseSupportTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "FranchiseSupportTaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeRole" TEXT,
    "assigneeUserId" TEXT,
    "branchId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FranchiseSupportTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FranchiseExpansionLead_status_idx" ON "FranchiseExpansionLead"("status");
CREATE INDEX IF NOT EXISTS "FranchiseExpansionLead_region_idx" ON "FranchiseExpansionLead"("region");
CREATE INDEX IF NOT EXISTS "FranchiseExpansionLead_responsibleManagerId_idx" ON "FranchiseExpansionLead"("responsibleManagerId");
CREATE INDEX IF NOT EXISTS "FranchiseExpansionLead_createdById_idx" ON "FranchiseExpansionLead"("createdById");

CREATE INDEX IF NOT EXISTS "FranchiseSupportTask_status_idx" ON "FranchiseSupportTask"("status");
CREATE INDEX IF NOT EXISTS "FranchiseSupportTask_branchId_idx" ON "FranchiseSupportTask"("branchId");
CREATE INDEX IF NOT EXISTS "FranchiseSupportTask_assigneeUserId_idx" ON "FranchiseSupportTask"("assigneeUserId");
CREATE INDEX IF NOT EXISTS "FranchiseSupportTask_createdById_idx" ON "FranchiseSupportTask"("createdById");
CREATE INDEX IF NOT EXISTS "FranchiseSupportTask_dueAt_idx" ON "FranchiseSupportTask"("dueAt");

DO $$ BEGIN
  ALTER TABLE "FranchiseExpansionLead" ADD CONSTRAINT "FranchiseExpansionLead_responsibleManagerId_fkey" FOREIGN KEY ("responsibleManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseExpansionLead" ADD CONSTRAINT "FranchiseExpansionLead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseSupportTask" ADD CONSTRAINT "FranchiseSupportTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseSupportTask" ADD CONSTRAINT "FranchiseSupportTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseSupportTask" ADD CONSTRAINT "FranchiseSupportTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
