import { PrismaClient } from '@prisma/client';
import {
  buildProductCodeMigrationPreview,
  PRODUCT_CODE_MIGRATION_NAME,
} from '../../src/inventory/product-code-migration.util';

const prisma = new PrismaClient();
const mode = process.argv[2] ?? 'preview';

async function writeAudit(action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      userId: null,
      role: 'SYSTEM_ADMINISTRATOR',
      action,
      entity: 'Product',
      entityId: String(metadata.productId ?? 'bulk'),
      metadata,
    },
  });
}

async function preview() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        categoryId: true,
        createdAt: true,
        productCategory: { select: { id: true, code: true, nameEn: true, nameRu: true } },
      },
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.productCategory.findMany({
      select: { id: true, code: true, nameEn: true, nameRu: true },
    }),
  ]);

  const result = buildProductCodeMigrationPreview(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      createdAt: product.createdAt,
      productCategory: product.productCategory,
    })),
    categories,
  );

  console.log(JSON.stringify(result, null, 2));
  await writeAudit('PRODUCT_CODE_MIGRATION_PREVIEWED', {
    migrationName: PRODUCT_CODE_MIGRATION_NAME,
    rowCount: result.rows.length,
    canApply: result.canApply,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });

  if (!result.canApply) {
    console.error('\nPreview blocked. Resolve conflicts before applying.');
    process.exitCode = 1;
  }
}

async function apply() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        categoryId: true,
        createdAt: true,
        productCategory: { select: { id: true, code: true, nameEn: true, nameRu: true } },
      },
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.productCategory.findMany({
      select: { id: true, code: true, nameEn: true, nameRu: true },
    }),
  ]);

  const preview = buildProductCodeMigrationPreview(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      createdAt: product.createdAt,
      productCategory: product.productCategory,
    })),
    categories,
  );

  if (!preview.canApply) {
    console.error('Migration blocked:', preview.errors);
    await writeAudit('PRODUCT_CODE_MIGRATION_FAILED', {
      migrationName: PRODUCT_CODE_MIGRATION_NAME,
      errors: preview.errors,
      timestamp: new Date().toISOString(),
    });
    process.exit(1);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of preview.rows) {
        if (row.oldCode === row.newCode) continue;
        await tx.product.update({
          where: { id: row.productId },
          data: { sku: row.newCode },
        });
        await tx.productCodeMigration.create({
          data: {
            productId: row.productId,
            oldCode: row.oldCode,
            newCode: row.newCode,
            migrationName: PRODUCT_CODE_MIGRATION_NAME,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: null,
            role: 'SYSTEM_ADMINISTRATOR',
            action: 'PRODUCT_CODE_MIGRATED',
            entity: 'Product',
            entityId: row.productId,
            metadata: {
              productId: row.productId,
              oldCode: row.oldCode,
              newCode: row.newCode,
              migrationName: PRODUCT_CODE_MIGRATION_NAME,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
    });
    console.log(`Migrated ${preview.rows.filter((row) => row.oldCode !== row.newCode).length} product codes.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeAudit('PRODUCT_CODE_MIGRATION_FAILED', {
      migrationName: PRODUCT_CODE_MIGRATION_NAME,
      error: message,
      timestamp: new Date().toISOString(),
    });
    console.error('Migration failed and was rolled back:', message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  try {
    if (mode === 'apply') {
      await apply();
    } else {
      await preview();
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
