/**
 * Apply character card audit cleanup for a target user (safe fixes only).
 *
 * Usage:
 *   npx tsx src/scripts/characterCardAuditCleanup.ts --user user@example.com
 *   npx tsx src/scripts/characterCardAuditCleanup.ts --user-id <uuid>
 *   npx tsx src/scripts/characterCardAuditCleanup.ts --user user@example.com --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { resolveSupabaseUrlAtBoot } from '../lib/supabaseUrlResolution';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const userIdx = args.indexOf('--user');
const userIdIdx = args.indexOf('--user-id');
const email = userIdx >= 0 ? args[userIdx + 1]?.trim() : process.env.TARGET_USER_EMAIL?.trim();
const explicitUserId = userIdIdx >= 0 ? args[userIdIdx + 1]?.trim() : process.env.TARGET_USER_ID?.trim();

async function resolveUserId(targetEmail: string): Promise<string> {
  const { getActiveSupabaseUrl } = await import('../lib/supabaseUrlResolution');
  const { projectRefFromSupabaseJwt } = await import('../lib/supabaseUrlResolution');
  const fallback =
    process.env.SUPABASE_URL_FALLBACK?.trim() ||
    (config.supabaseAnonKey
      ? `https://${projectRefFromSupabaseJwt(config.supabaseAnonKey)}.supabase.co`
      : '');
  const urls = [getActiveSupabaseUrl(), fallback].filter(Boolean);
  for (const url of urls) {
    const client = createClient(url, config.supabaseServiceRoleKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
    if (error) continue;
    const user = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (user) return user.id;
  }
  throw new Error(`No user found for ${targetEmail}`);
}

async function main() {
  await resolveSupabaseUrlAtBoot();
  const { characterCardAuditService } = await import('../services/characters/audit/characterCardAuditService');
  const { characterCardCleanupService } = await import('../services/characters/audit/characterCardCleanupService');

  if (!email && !explicitUserId) {
    console.error('Required: --user <email> or --user-id <uuid>');
    process.exit(1);
  }

  const userId = explicitUserId ?? (await resolveUserId(email!));
  console.log(`Target: ${email ?? explicitUserId} (${userId})`);

  const audit = await characterCardAuditService.audit(userId);
  const actionable = audit.results.filter(
    (r) =>
      r.recommendedAction !== 'keep' ||
      r.status === 'junk_test_data' ||
      r.status === 'bare_title_invalid' ||
      r.status === 'wrong_domain' ||
      r.status === 'broken_span',
  );

  console.log(`\nAudit: ${audit.characterCount} cards, ${actionable.length} need attention`);
  for (const r of actionable) {
    console.log(
      `  - ${r.currentTitle}: ${r.status} → ${r.recommendedAction}${r.suggestedTitle ? ` (${r.suggestedTitle})` : ''}`,
    );
  }

  const report = await characterCardCleanupService.applySafeFixes(userId, { dryRun });
  console.log(`\n${dryRun ? 'Dry run' : 'Applied'}: ${report.applied} fixes, ${report.skipped} skipped`);
  for (const action of report.actions.filter((a) => a.applied !== 'skipped')) {
    console.log(
      `  ✓ ${action.currentTitle}: ${action.applied}${action.targetTitle ? ` → ${action.targetTitle}` : ''}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
