import { PrismaClient } from '@prisma/client';
import {
  CLEANED_TABLES,
  PRESERVED_TABLES,
  runDevDatabaseCleanup,
} from './dev-database-cleanup.util';

const prisma = new PrismaClient();

async function main() {
  const confirm = process.argv.includes('--confirm');
  const preview = process.argv.includes('--preview');

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_DB_CLEANUP !== 'true') {
    throw new Error(
      'Refusing to run development database cleanup in production. Set ALLOW_DEV_DB_CLEANUP=true to override.',
    );
  }

  if (preview) {
    console.log('Development database cleanup — preview');
    console.log('Preserved tables:', PRESERVED_TABLES.join(', '));
    console.log('Cleaned tables:', CLEANED_TABLES.join(', '));
    console.log('Run with --confirm to execute cleanup.');
    return;
  }

  if (!confirm) {
    console.log('Development database cleanup requires --confirm flag.');
    console.log('Use --preview to list preserved/cleaned tables without changes.');
    process.exitCode = 1;
    return;
  }

  console.log('Starting development database cleanup...');
  const result = await runDevDatabaseCleanup(prisma);

  const deletedTotal = Object.values(result.deleted).reduce((sum, count) => sum + count, 0);
  const resetTotal = Object.values(result.reset).reduce((sum, count) => sum + count, 0);

  console.log('Cleanup completed.');
  console.log(`Deleted rows: ${deletedTotal}`);
  console.log(`Reset records: ${resetTotal}`);
  console.log('Details:', JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
