/**
 * Merge exact canonical duplicate character cards.
 *
 * Dry-run by default:
 *   cd apps/server && npx tsx src/scripts/mergeDuplicateCharacters.ts
 *
 * Apply:
 *   cd apps/server && npx tsx src/scripts/mergeDuplicateCharacters.ts --apply
 *
 * Optional single user:
 *   cd apps/server && npx tsx src/scripts/mergeDuplicateCharacters.ts --user <uuid> --apply
 */

import { logger } from '../logger';
import { characterMergeService } from '../services/characterMergeService';
import { supabaseAdmin } from '../services/supabaseClient';
import { normalizeNameKey } from '../utils/nameNormalization';

type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function mentionCount(row: CharacterRow): number {
  return Number(row.metadata?.mention_count ?? 0);
}

function chooseTarget(rows: CharacterRow[]): CharacterRow {
  return [...rows].sort((a, b) => {
    const mentionDiff = mentionCount(b) - mentionCount(a);
    if (mentionDiff !== 0) return mentionDiff;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  })[0];
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const userId = argValue('--user');

  let query = supabaseAdmin
    .from('characters')
    .select('id, user_id, name, alias, metadata, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const byUserAndName = new Map<string, CharacterRow[]>();
  for (const row of (data ?? []) as CharacterRow[]) {
    const key = `${row.user_id}:${normalizeNameKey(row.name)}`;
    if (!byUserAndName.has(key)) byUserAndName.set(key, []);
    byUserAndName.get(key)!.push(row);
  }

  const duplicateGroups = [...byUserAndName.values()].filter(rows => rows.length > 1);
  logger.info({ groups: duplicateGroups.length, apply }, 'Character duplicate scan complete');

  let merged = 0;
  let failed = 0;

  for (const rows of duplicateGroups) {
    const target = chooseTarget(rows);
    const sources = rows.filter(row => row.id !== target.id);
    logger.info(
      {
        userId: target.user_id,
        canonicalName: normalizeNameKey(target.name),
        target: { id: target.id, name: target.name },
        sources: sources.map(source => ({ id: source.id, name: source.name })),
      },
      apply ? 'Merging duplicate character group' : 'Would merge duplicate character group'
    );

    if (!apply) continue;

    for (const source of sources) {
      try {
        await characterMergeService.merge(source.user_id, source.id, target.id, {
          mergedBy: 'SYSTEM',
          reason: `Exact canonical duplicate cleanup: "${source.name}" -> "${target.name}"`,
        });
        merged++;
      } catch (err) {
        failed++;
        logger.error({ err, sourceId: source.id, targetId: target.id }, 'Character duplicate merge failed');
      }
    }
  }

  logger.info({ merged, failed, dryRun: !apply }, 'Character duplicate cleanup finished');
}

run().catch(err => {
  logger.error({ err }, 'Character duplicate cleanup crashed');
  process.exit(1);
});
