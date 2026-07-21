import { PrismaClient } from '@prisma/client';
import {
  CLEANED_TABLES,
  PRESERVED_TABLES,
  runDevDatabaseCleanup,
  verifyDevDatabaseCleanup,
} from './dev-database-cleanup.util';

const prisma = new PrismaClient();

async function main() {
  const confirm = process.argv.includes('--confirm');
  const preview = process.argv.includes('--preview');
  const verifyOnly = process.argv.includes('--verify');

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_DB_CLEANUP !== 'true') {
    throw new Error(
      'Refusing to run development database cleanup in production. Set ALLOW_DEV_DB_CLEANUP=true to override.',
    );
  }

  if (preview) {
    console.log('Development database cleanup — preview');
    console.log('Preserved tables:', PRESERVED_TABLES.join(', '));
    console.log(`Cleaned tables (${CLEANED_TABLES.length}):`, CLEANED_TABLES.join(', '));
    console.log('Run with --confirm to execute cleanup.');
    return;
  }

  if (verifyOnly) {
    const verification = await verifyDevDatabaseCleanup(prisma);
    console.log('Verification:', JSON.stringify(verification, null, 2));
    if (!verification.passed) {
      process.exitCode = 1;
    }
    return;
  }

  if (!confirm) {
    console.log('Development database cleanup requires --confirm flag.');
    console.log('Use --preview to list preserved/cleaned tables without changes.');
    console.log('Use --verify to check database state without deleting.');
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

  const verification = await verifyDevDatabaseCleanup(prisma);
  console.log('Verification:', JSON.stringify(verification, null, 2));

  if (!verification.passed) {
    console.error('Cleanup verification FAILED:', verification.failures.join('; '));
    process.exitCode = 1;
    return;
  }

  console.log('Cleanup verification PASSED.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
