#!/usr/bin/env node
/**
 * Removes known-bad local-only Prisma migrations that break `migrate dev`
 * shadow-database replay (P3006 / P1014).
 *
 * Bad migration: 20260721125008_fix_project
 * It runs ALTER INDEX on ProcurementPaymentInfoVersion_...versionNumber_
 * BEFORE that table exists (created in 20260721150100), so shadow DB fails.
 *
 * The real index rename is in:
 *   20260721180000_fix_payment_info_version_index_name
 */

const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const BAD_MIGRATIONS = ['20260721125008_fix_project'];

function rmDirRecursive(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

let removed = 0;
for (const name of BAD_MIGRATIONS) {
  const full = path.join(migrationsDir, name);
  if (fs.existsSync(full)) {
    rmDirRecursive(full);
    console.log(`[pre-migrate-clean] Removed broken local migration: ${name}`);
    removed += 1;
  }
}

if (removed === 0) {
  console.log('[pre-migrate-clean] No broken local migrations found.');
}
