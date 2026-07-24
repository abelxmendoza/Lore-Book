#!/usr/bin/env tsx
/**
 * One-shot repair for skill migration fallout:
 * - mutual merge of Coding ↔ Product iteration (both inactive)
 * - display-case renames for AI-assisted coding / Software debugging
 *
 * Usage:
 *   npx tsx src/scripts/skillsRepairMergeSurvivors.ts --user-id <uuid>
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../../.env') });

import { supabaseAdmin } from '../services/supabaseClient';
import { normalizeSkillKey } from '../services/skills/skillIdentity';
import { SKILL_MIGRATION_VERSION } from '../services/skills/migration/skillMigrationTypes';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const userId =
    argValue('--user-id')
    || process.env.SKILL_MIGRATION_USER_ID
    || process.env.TARGET_USER_ID
    || '';
  if (!userId) {
    console.error('Required: --user-id <uuid>');
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from('skills')
    .select('id, skill_name, is_active, metadata, practice_count, total_xp, current_level')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = data ?? [];

  const byKey = new Map(rows.map((r) => [normalizeSkillKey(r.skill_name), r]));
  const coding = byKey.get(normalizeSkillKey('coding'));
  const iteration = byKey.get(normalizeSkillKey('product iteration'));
  const spd = byKey.get(normalizeSkillKey('software product development'));

  // Restore Software Product Development survivor
  const candidates = [spd, coding, iteration].filter(Boolean) as typeof rows;
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const score = (r: (typeof rows)[0]) =>
        (r.is_active ? 1000 : 0)
        + (r.practice_count ?? 0) * 10
        + (r.total_xp ?? 0)
        + (r.current_level ?? 0);
      return score(b) - score(a);
    });
    const survivor = candidates[0]!;
    const meta = {
      ...((survivor.metadata ?? {}) as Record<string, unknown>),
      capability_entity_type: 'SKILL',
      skill_book_visible: true,
      archived: false,
      migration_status: 'repaired_survivor',
      migration_version: SKILL_MIGRATION_VERSION,
      migration_reason: 'restore_software_product_development_survivor',
      aliases: Array.from(
        new Set([
          ...((Array.isArray((survivor.metadata as any)?.aliases)
            ? (survivor.metadata as any).aliases
            : []) as string[]),
          'Coding',
          'Product iteration',
          'Software development',
        ]),
      ),
    };
    delete (meta as any).merge_target;

    const { error: upErr } = await supabaseAdmin
      .from('skills')
      .update({
        skill_name: 'Software Product Development',
        is_active: true,
        metadata: meta,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('id', survivor.id);
    if (upErr) throw upErr;
    console.log(`Survivor restored: ${survivor.skill_name} → Software Product Development (${survivor.id})`);

    for (const other of candidates.slice(1)) {
      const otherMeta = {
        ...((other.metadata ?? {}) as Record<string, unknown>),
        capability_entity_type: 'SKILL',
        skill_book_visible: false,
        archived: true,
        migration_status: 'merge',
        migration_version: SKILL_MIGRATION_VERSION,
        migration_reason: 'merge_into_Software Product Development',
        merge_target: 'Software Product Development',
        migration_previous: {
          skill_name: other.skill_name,
          entity_type: 'SKILL',
          archived: false,
        },
      };
      const { error: mErr } = await supabaseAdmin
        .from('skills')
        .update({
          is_active: false,
          metadata: otherMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', other.id);
      if (mErr) throw mErr;
      console.log(`Merged inactive: ${other.skill_name} (${other.id})`);
    }
  } else {
    console.log('No Coding / Product iteration / SPD rows found — skip survivor repair');
  }

  // Display renames for known canonical titles (case / hyphen)
  const renames: Array<{ from: string; to: string }> = [
    { from: 'AI-assisted coding', to: 'AI-Assisted Coding' },
    { from: 'Software debugging', to: 'Software Debugging' },
    { from: 'Front-End Development', to: 'Front-End Development' },
  ];
  for (const { from, to } of renames) {
    const row = byKey.get(normalizeSkillKey(from));
    if (!row || row.skill_name === to) continue;
    const { error: rErr } = await supabaseAdmin
      .from('skills')
      .update({ skill_name: to, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', row.id);
    if (rErr) throw rErr;
    console.log(`Renamed: ${row.skill_name} → ${to}`);
  }

  console.log('Repair complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
