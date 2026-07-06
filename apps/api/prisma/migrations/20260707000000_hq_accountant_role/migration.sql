ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HQ_ACCOUNTANT';

UPDATE "User"
SET role = 'HQ_ACCOUNTANT'
WHERE role = 'ACCOUNTANT' AND "branchId" IS NULL;

INSERT INTO "RbacRole" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), 'HQ_ACCOUNTANT', 'HQ ACCOUNTANT', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "RbacRole" WHERE "code" = 'HQ_ACCOUNTANT');

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), hq_role."id", rp."permissionId", NOW()
FROM "RbacRole" hq_role
JOIN "RbacRole" acc_role ON acc_role."code" = 'ACCOUNTANT'
JOIN "RolePermission" rp ON rp."roleId" = acc_role."id"
WHERE hq_role."code" = 'HQ_ACCOUNTANT'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" existing
    WHERE existing."roleId" = hq_role."id" AND existing."permissionId" = rp."permissionId"
  );

INSERT INTO "UserRole" ("id", "userId", "roleId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), u."id", hq_role."id", NOW()
FROM "User" u
JOIN "RbacRole" hq_role ON hq_role."code" = 'HQ_ACCOUNTANT'
WHERE u.role = 'HQ_ACCOUNTANT'
  AND NOT EXISTS (
    SELECT 1 FROM "UserRole" ur
    JOIN "RbacRole" r ON r."id" = ur."roleId"
    WHERE ur."userId" = u."id" AND r."code" = 'HQ_ACCOUNTANT'
  );
