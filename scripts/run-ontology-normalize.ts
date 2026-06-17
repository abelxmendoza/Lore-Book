#!/usr/bin/env npx tsx
/**
 * Run spatial + social ontology normalization and character rescan for one user.
 * Usage: npx tsx scripts/run-ontology-normalize.ts [--user email@example.com] [--dry-run]
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv(): void {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dryRun = process.argv.includes('--dry-run');
const skipRescan = process.argv.includes('--skip-rescan');

async function resolveUserId(): Promise<string> {
  const explicit = arg('--user');
  const ownerId = process.env.OWNER_USER_ID || process.env.FOUNDER_USER_ID;
  const ownerEmail = process.env.OWNER_EMAIL || process.env.FOUNDER_EMAIL || process.env.ADMIN_EMAIL;

  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');

  if (explicit) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === explicit.toLowerCase());
    if (!user) throw new Error(`No user for ${explicit}`);
    return user.id;
  }
  if (ownerId) return ownerId;
  if (ownerEmail) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
    if (!user) throw new Error(`No user for ${ownerEmail}`);
    return user.id;
  }
  throw new Error('Pass --user <email> or set OWNER_USER_ID / OWNER_EMAIL in .env');
}

async function run(): Promise<void> {
  const userId = await resolveUserId();
  console.log(`${dryRun ? '[DRY-RUN]' : '[EXECUTE]'} Ontology normalize for`, userId.slice(0, 8) + '…\n');

  const { invalidateOntologySchemaCache } = await import('../apps/server/src/services/ontology/ontologySchemaService');
  invalidateOntologySchemaCache();

  const { locationNormalizationService } = await import('../apps/server/src/services/locationNormalizationService');
  const { organizationNormalizationService } = await import('../apps/server/src/services/organizationNormalizationService');

  const locations = await locationNormalizationService.normalizeUserLocations(userId, { dryRun });
  console.log('Locations:', locations);

  const organizations = await organizationNormalizationService.normalizeUserOrganizations(userId, { dryRun });
  console.log('Organizations:', organizations);

  if (!dryRun && !skipRescan) {
    const { inferenceOrchestrator } = await import('../apps/server/src/services/inference/inferenceOrchestrator');
    const report = await inferenceOrchestrator.sync(userId, { tier: 't2', force: true });
    console.log('Inference T2:', report);
  } else if (!dryRun) {
    const { inferenceOrchestrator } = await import('../apps/server/src/services/inference/inferenceOrchestrator');
    const report = await inferenceOrchestrator.sync(userId, { tier: 't1' });
    console.log('Inference T1:', report);
  } else if (skipRescan) {
    console.log('Character rescan: skipped (--skip-rescan)');
  } else {
    console.log('Character rescan: skipped in dry-run');
  }

  console.log('\n✅ Done.');
}

run().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
