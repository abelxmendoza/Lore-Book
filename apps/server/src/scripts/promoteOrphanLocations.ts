/**
 * Promote orphan people_places 'place' rows (no canonical locations row by
 * normalized name) into canonical `locations` rows, preserving provenance.
 * Idempotent: reuses locationMergeService.resolveCanonicalLocationId.
 *
 * Usage:
 *   npx tsx apps/server/src/scripts/promoteOrphanLocations.ts --dry-run --all-users
 *   npx tsx apps/server/src/scripts/promoteOrphanLocations.ts --all-users
 *   npx tsx apps/server/src/scripts/promoteOrphanLocations.ts [userId]
 *   npx tsx apps/server/src/scripts/promoteOrphanLocations.ts --dry-run [userId]
 */
import '../config';
import { locationMergeService } from '../services/locationMergeService';
import { supabaseAdmin } from '../services/supabaseClient';

type OrphanPlace = { id: string; name: string; type: string };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function listUserIds(allUsers: boolean, explicitUserId?: string): Promise<string[]> {
  if (explicitUserId) return [explicitUserId];
  if (!allUsers) {
    const fallback = process.env.ADMIN_USER_ID ?? process.env.OWNER_USER_ID;
    if (!fallback) throw new Error('Provide userId, --all-users, or set ADMIN_USER_ID');
    return [fallback];
  }

  const { data, error } = await supabaseAdmin.from('people_places').select('user_id').eq('type', 'place');
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];
  return ids.sort();
}

async function findOrphans(userId: string): Promise<OrphanPlace[]> {
  const [{ data: pps }, { data: locs }] = await Promise.all([
    supabaseAdmin.from('people_places').select('id, name, type').eq('user_id', userId).eq('type', 'place'),
    supabaseAdmin.from('locations').select('normalized_name').eq('user_id', userId),
  ]);
  const canon = new Set((locs ?? []).map((l: { normalized_name: string }) => l.normalized_name));
  return (pps ?? []).filter((p: OrphanPlace) => !canon.has(norm(p.name))) as OrphanPlace[];
}

async function promoteUser(userId: string, dryRun: boolean): Promise<{ orphans: number; promoted: number }> {
  const orphans = await findOrphans(userId);
  if (!orphans.length) {
    console.log(`  ${userId}: 0 orphans`);
    return { orphans: 0, promoted: 0 };
  }

  console.log(`  ${userId}: ${orphans.length} orphan(s)`);
  let promoted = 0;
  for (const o of orphans) {
    if (dryRun) {
      console.log(`    [dry-run] would promote "${o.name}" (pp ${o.id})`);
      continue;
    }
    const id = await locationMergeService.resolveCanonicalLocationId(userId, o.id);
    console.log(`    promote "${o.name}" (pp ${o.id}) -> canonical locations.id ${id}`);
    if (id) promoted += 1;
  }
  return { orphans: orphans.length, promoted: dryRun ? 0 : promoted };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allUsers = args.includes('--all-users');
  const userArg = args.find((a) => !a.startsWith('--'));

  const userIds = await listUserIds(allUsers, userArg);
  console.log(`\n=== Orphan Location Promotion ${dryRun ? '(DRY RUN)' : '(EXECUTE)'} ===`);
  console.log(`Users: ${userIds.length}\n`);

  let totalOrphans = 0;
  let totalPromoted = 0;
  let usersWithOrphans = 0;

  for (const userId of userIds) {
    const result = await promoteUser(userId, dryRun);
    totalOrphans += result.orphans;
    totalPromoted += result.promoted;
    if (result.orphans > 0) usersWithOrphans += 1;
  }

  console.log('\n--- Summary ---');
  console.log(`  Users scanned: ${userIds.length}`);
  console.log(`  Users with orphans: ${usersWithOrphans}`);
  console.log(`  Orphan places found: ${totalOrphans}`);
  if (dryRun) {
    console.log(`  Would promote: ${totalOrphans}`);
  } else {
    console.log(`  Promoted: ${totalPromoted}`);
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
