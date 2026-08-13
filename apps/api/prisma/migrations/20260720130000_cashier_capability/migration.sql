-- Cashier capability permission (UserPermission only; finance tables come later)

INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), 'cashier', 'finance', 'cashier', 'Additional cashier capability for branch employees', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'cashier');

CREATE TABLE IF NOT EXISTS "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedById" TEXT,
    "revokedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permissionId_key" ON "UserPermission"("userId", "permissionId");
CREATE INDEX IF NOT EXISTS "UserPermission_userId_idx" ON "UserPermission"("userId");
CREATE INDEX IF NOT EXISTS "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");
CREATE INDEX IF NOT EXISTS "UserPermission_isActive_idx" ON "UserPermission"("isActive");

DO $$ BEGIN
  ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Dedicated cashiers receive the cashier capability permission record for consistency
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "isActive", "grantedAt", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || u."id"),
  u."id",
  p."id",
  true,
  NOW(),
  NOW(),
  NOW()
FROM "User" u
JOIN "Permission" p ON p."code" = 'cashier'
WHERE u."role" = 'CASHIER'
  AND u."branchId" IS NOT NULL
  AND u."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "UserPermission" up
    WHERE up."userId" = u."id" AND up."permissionId" = p."id"
  );
