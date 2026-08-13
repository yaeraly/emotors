/**
 * Print safe database connection diagnostics for API / Prisma scripts.
 * Usage: cd apps/api && npx tsx scripts/print-db-connection.ts
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

function maskDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '').split('?')[0],
      schema: parsed.searchParams.get('schema') || 'public',
      user: parsed.username,
      password: '***',
    };
  } catch {
    return { error: 'invalid DATABASE_URL' };
  }
}

async function main() {
  const apiEnvPath = path.join(process.cwd(), '.env');
  const rootEnvPath = path.join(process.cwd(), '..', '.env');
  const envFile = fs.existsSync(apiEnvPath)
    ? 'apps/api/.env'
    : fs.existsSync(rootEnvPath)
      ? 'apps/.env'
      : 'process environment only';

  const dbUrl = process.env.DATABASE_URL ?? '';
  const prisma = new PrismaClient();
  const session = await prisma.$queryRaw<
    Array<{ db: string; host: string | null; port: number | null }>
  >`SELECT current_database() as db, inet_server_addr()::text as host, inet_server_port() as port`;

  const counts = await prisma.$queryRaw<
    Array<{ label: string; count: bigint }>
  >`
    SELECT 'ProcurementOrder' as label, count(*)::bigint as count FROM "ProcurementOrder"
    UNION ALL SELECT 'StockMovement_IN', count(*)::bigint FROM "StockMovement" WHERE type='IN'
    UNION ALL SELECT 'FifoInventoryBatch', count(*)::bigint FROM "FifoInventoryBatch"
    UNION ALL SELECT 'Product_SUS001', count(*)::bigint FROM "Product" WHERE sku='SUS001' AND "deletedAt" IS NULL
  `;

  console.log(
    JSON.stringify(
      {
        NODE_ENV: process.env.NODE_ENV ?? null,
        envFileLoaded: envFile,
        prismaDatasource: 'postgresql (apps/api/prisma/schema.prisma → env("DATABASE_URL"))',
        DATABASE_URL: maskDatabaseUrl(dbUrl),
        postgresSession: session[0] ?? null,
        tableCounts: counts.map((row) => ({ ...row, count: Number(row.count) })),
        note: 'API (npm run dev), Prisma scripts, and repair/verify scripts all read DATABASE_URL from apps/api/.env unless overridden in the shell.',
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
